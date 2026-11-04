import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../models/auth-session.js";
import { PreAuthSession } from "../models/pre-auth-session.js";

afterEach(() => vi.restoreAllMocks());

describe("assistant authorization", () => {
  it("rejects an unauthenticated assistant command", async () => {
    const preSessions = new Map();
    vi.spyOn(PreAuthSession, "findOne").mockImplementation(async (query) => preSessions.get(query.sessionIdHash) || null);
    vi.spyOn(PreAuthSession, "create").mockImplementation(async (data) => { preSessions.set(data.sessionIdHash, data); return data; });
    vi.spyOn(AuthSession, "findOne").mockResolvedValue(null);
    const app = createApp({ corsAllowedOrigins: "http://localhost:5173" });
    const bootstrap = await request(app).get("/api/v1/auth/csrf");
    const cookie = bootstrap.headers["set-cookie"].find((value) => value.startsWith("preauth_session=")).split(";")[0];
    const result = await request(app).post("/api/v1/assistant/messages").set("Cookie", cookie).set("X-CSRF-Token", bootstrap.body.csrfToken).send({ text: "Add a task", mode: "text" });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHENTICATED");
  });
});
