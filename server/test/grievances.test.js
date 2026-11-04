import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../models/auth-session.js";
import { PreAuthSession } from "../models/pre-auth-session.js";
import { Grievance } from "../models/grievance.js";
import { User } from "../models/user.js";
import { interpretGrievance, parseComplaintLocally } from "../services/grievance-ai.js";

const app = createApp({ corsAllowedOrigins: "http://localhost:5173" });
const users = new Map(); const preSessions = new Map(); const sessions = new Map(); const tickets = new Map();
let serial = 0;
const result = (value) => { const p = Promise.resolve(value); return { select: () => p, sort: () => ({ skip: () => ({ limit: () => p }), limit: () => p }), then: p.then.bind(p) }; };
const cookie = (res, name) => res.headers["set-cookie"].find((v) => v.startsWith(name + "=")).split(";")[0];

beforeEach(() => {
  users.clear(); preSessions.clear(); sessions.clear(); tickets.clear(); serial = 0;
  vi.spyOn(PreAuthSession, "findOne").mockImplementation(async (q) => preSessions.get(q.sessionIdHash) || null);
  vi.spyOn(PreAuthSession, "create").mockImplementation(async (data) => { const v = { ...data, save: vi.fn(async () => {}) }; preSessions.set(data.sessionIdHash, v); return v; });
  vi.spyOn(AuthSession, "findOne").mockImplementation(async (q) => [...sessions.values()].find((v) => v.tokenHash === q.tokenHash && v.revokedAt === null) || null);
  vi.spyOn(AuthSession, "create").mockImplementation(async (data) => { const v = { ...data, save: vi.fn(async () => {}) }; sessions.set(data.tokenHash, v); return v; });
  vi.spyOn(User, "create").mockImplementation(async (data) => { const u = { _id: "6500000000000000000000" + (++serial), ...data, role: data.email.startsWith("admin") ? "ADMIN" : "USER", deletedAt: null }; users.set(String(u._id), u); return u; });
  vi.spyOn(User, "findOne").mockImplementation((q) => result(users.get(String(q._id)) || null));
  vi.spyOn(Grievance, "create").mockImplementation(async (data) => { const v = { _id: "g" + (++serial), version: 1, history: [], ...data, createdAt: new Date(), updatedAt: new Date() }; tickets.set(v.ticketId, v); return v; });
  vi.spyOn(Grievance, "find").mockImplementation((q) => result([...tickets.values()].filter((v) => String(v.ownerId) === String(q.ownerId) && (!q.status || v.status === q.status))));
  vi.spyOn(Grievance, "findOne").mockImplementation(async (q) => { const v = tickets.get(q.ticketId); return v && (!q.ownerId || String(v.ownerId) === String(q.ownerId)) ? v : null; });
  vi.spyOn(Grievance, "findOneAndUpdate").mockImplementation(async (q, update) => { const v = tickets.get(q.ticketId); if (!v || v.version !== q.version) return null; Object.assign(v, update.$set); v.history.push(update.$push.history); v.version += update.$inc.version; return v; });
  vi.spyOn(Grievance, "aggregate").mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function register(email) {
  const boot = await request(app).get("/api/v1/auth/csrf");
  const registered = await request(app).post("/api/v1/auth/register").set("Cookie", cookie(boot, "preauth_session")).set("X-CSRF-Token", boot.body.csrfToken).send({ email: email + "@example.com", password: "long-enough-password", preferredName: "Test User", timezone: "Asia/Kolkata" });
  const session = cookie(registered, "session");
  const csrf = await request(app).get("/api/v1/auth/csrf").set("Cookie", session);
  return { session, csrf: csrf.body.csrfToken, userId: registered.body.user.id };
}

describe("grievance reporting", () => {
  it("extracts known categories without inventing an unknown category", () => {
    expect(parseComplaintLocally("Urgent power outage near the library")).toMatchObject({ category: "Electricity", location: "the library" });
    expect(parseComplaintLocally("Something happened").category).toBe("");
  });
  it("uses the local interpreter when Gemini is unavailable or returns malformed data", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    const unavailable = await interpretGrievance("Urgent power outage near the library", async () => ({ ok: false, status: 503 }));
    expect(unavailable).toMatchObject({ processedBy: "local", category: "Electricity" });
    const malformed = await interpretGrievance("Water leak at the science building", async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }) }));
    expect(malformed).toMatchObject({ processedBy: "local", category: "Water" });
  });
  it("validates, creates an owned ticket, and does not create when location is missing", async () => {
    const a = await register("reporter");
    const missing = await request(app).post("/api/v1/grievances").set("Cookie", a.session).set("X-CSRF-Token", a.csrf).send({ text: "Urgent power outage", mode: "text" });
    expect(missing.status).toBe(200); expect(missing.body.data.needsClarification).toBe(true); expect(Grievance.create).not.toHaveBeenCalled();
    const invalid = await request(app).post("/api/v1/grievances").set("Cookie", a.session).set("X-CSRF-Token", a.csrf).send({ text: "short", mode: "text" });
    expect(invalid.status).toBe(400);
    const created = await request(app).post("/api/v1/grievances").set("Cookie", a.session).set("X-CSRF-Token", a.csrf).send({ text: "Urgent power outage near the library", mode: "voice_transcript" });
    expect(created.status).toBe(201); expect(created.body.data).toMatchObject({ status: "OPEN", category: "Electricity", location: "the library" });
    expect(String(tickets.get(created.body.data.ticketId).ownerId)).toBe(a.userId);
    expect((await request(app).get("/api/v1/grievances").set("Cookie", a.session)).body.data).toHaveLength(1);
  });
  it("prevents cross-user ticket reads and restricts status changes to admins", async () => {
    const owner = await register("owner"); const other = await register("other"); const admin = await register("admin-user");
    const made = await request(app).post("/api/v1/grievances").set("Cookie", owner.session).set("X-CSRF-Token", owner.csrf).send({ text: "Urgent water leak at the library", mode: "text" });
    const ticketId = made.body.data.ticketId;
    expect((await request(app).get("/api/v1/grievances/" + ticketId).set("Cookie", other.session)).status).toBe(404);
    const forbidden = await request(app).patch("/api/v1/grievances/" + ticketId + "/status").set("Cookie", owner.session).set("X-CSRF-Token", owner.csrf).send({ status: "IN_PROGRESS", version: 1 });
    expect(forbidden.status).toBe(403);
    const changed = await request(app).patch("/api/v1/grievances/" + ticketId + "/status").set("Cookie", admin.session).set("X-CSRF-Token", admin.csrf).send({ status: "IN_PROGRESS", resolutionNotes: "Team is inspecting the leak", version: 1 });
    expect(changed.status).toBe(200); expect(changed.body.data.status).toBe("IN_PROGRESS"); expect(changed.body.data.history).toHaveLength(2);
  });
  it("rejects unauthenticated ticket access", async () => {
    const response = await request(app).get("/api/v1/grievances");
    expect(response.status).toBe(401);
  });
});
