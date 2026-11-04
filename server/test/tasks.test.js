import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../models/auth-session.js";
import { PreAuthSession } from "../models/pre-auth-session.js";
import { Task, softDeleteTask } from "../models/task.js";
import { User } from "../models/user.js";

const app = createApp({ corsAllowedOrigins: "http://localhost:5173" });
const users = new Map();
const sessions = new Map();
const preSessions = new Map();
const tasks = new Map();
let nextUser = 1;
let nextTask = 1;

function queryResult(value) {
  const promise = Promise.resolve(value);
  return { select: () => promise, sort: () => ({ skip: () => ({ limit: () => promise }), limit: () => promise }), then: promise.then.bind(promise) };
}
function cookieFrom(response, name) {
  return response.headers["set-cookie"].find((value) => value.startsWith(`${name}=`)).split(";")[0];
}
function applyUpdate(task, update) {
  Object.assign(task, update.$set);
  for (const [key, amount] of Object.entries(update.$inc || {})) task[key] += amount;
  task.updatedAt = new Date();
  return { ...task };
}

beforeEach(() => {
  users.clear(); sessions.clear(); preSessions.clear(); tasks.clear();
  nextUser = 1; nextTask = 1;
  vi.spyOn(PreAuthSession, "findOne").mockImplementation(async (filter) => [...preSessions.values()].find((item) => item.sessionIdHash === filter.sessionIdHash) || null);
  vi.spyOn(PreAuthSession, "create").mockImplementation(async (data) => {
    const record = { ...data, save: vi.fn(async () => {}) };
    preSessions.set(data.sessionIdHash, record);
    return record;
  });
  vi.spyOn(AuthSession, "findOne").mockImplementation(async (filter) => [...sessions.values()].find((item) => item.tokenHash === filter.tokenHash && item.revokedAt === null) || null);
  vi.spyOn(AuthSession, "create").mockImplementation(async (data) => {
    const session = { ...data, save: vi.fn(async () => {}) };
    sessions.set(data.tokenHash, session);
    return session;
  });
  vi.spyOn(User, "create").mockImplementation(async (data) => {
    const user = { _id: `65000000000000000000000${nextUser++}`, ...data, timezone: data.timezone, deletedAt: null };
    users.set(user._id, user);
    return user;
  });
  vi.spyOn(User, "findOne").mockImplementation((filter) => queryResult(users.get(String(filter._id)) || null));
  vi.spyOn(Task, "create").mockImplementation(async (data) => {
    const now = new Date();
    const task = { _id: `66000000000000000000000${nextTask++}`, ...data, version: 1, deletedAt: null, completedAt: null, createdAt: now, updatedAt: now };
    tasks.set(task._id, task);
    return { ...task };
  });
  vi.spyOn(Task, "findOne").mockImplementation(async (filter) => {
    const item = tasks.get(String(filter._id));
    return item && String(item.userId) === String(filter.userId) && item.deletedAt === null ? { ...item } : null;
  });
  vi.spyOn(Task, "findOneAndUpdate").mockImplementation(async (filter, update) => {
    const item = tasks.get(String(filter._id));
    if (!item || String(item.userId) !== String(filter.userId) || item.deletedAt !== null || item.version !== filter.version) return null;
    return applyUpdate(item, update);
  });
  vi.spyOn(Task, "exists").mockImplementation(async (filter) => {
    const item = tasks.get(String(filter._id));
    return item && String(item.userId) === String(filter.userId) && item.deletedAt === null ? { _id: item._id } : null;
  });
  vi.spyOn(Task, "find").mockImplementation((filter) => queryResult([...tasks.values()].filter((item) => String(item.userId) === String(filter.userId) && item.deletedAt === null)));
  vi.spyOn(Task, "countDocuments").mockImplementation(async (filter) => [...tasks.values()].filter((item) => String(item.userId) === String(filter.userId) && item.deletedAt === null).length);
});

afterEach(() => vi.restoreAllMocks());

async function register(email) {
  const bootstrap = await request(app).get("/api/v1/auth/csrf");
  const preCookie = cookieFrom(bootstrap, "preauth_session");
  const registration = await request(app).post("/api/v1/auth/register")
    .set("Cookie", preCookie).set("X-CSRF-Token", bootstrap.body.csrfToken)
    .send({ email, password: "long-enough-password", preferredName: "Task Tester", timezone: "Asia/Kolkata" });
  const sessionCookie = cookieFrom(registration, "session");
  const csrf = await request(app).get("/api/v1/auth/csrf").set("Cookie", sessionCookie);
  return { cookie: sessionCookie, csrf: csrf.body.csrfToken, userId: registration.body.user.id };
}

describe("authenticated task API", () => {
  it("creates and retrieves a task with authenticated ownership and DATE semantics", async () => {
    const auth = await register("first@example.com");
    const created = await request(app).post("/api/v1/tasks").set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf)
      .send({ title: "Submit report", due: { precision: "DATE", date: "2026-11-06", timezone: "Asia/Kolkata" } });
    expect(created.status).toBe(201);
    expect(created.body.task).toMatchObject({ priority: "MEDIUM", status: "PENDING", activeReminder: null, due: { precision: "DATE", date: "2026-11-06" }, version: 1 });
    expect(created.body.task.dueAt).toBeUndefined();
    expect(String(tasks.get(created.body.task.id).userId)).toBe(auth.userId);
    const fetched = await request(app).get(`/api/v1/tasks/${created.body.task.id}`).set("Cookie", auth.cookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body.task.id).toBe(created.body.task.id);
  });

  it("updates, completes and reopens tasks with version checks", async () => {
    const auth = await register("lifecycle@example.com");
    const created = await request(app).post("/api/v1/tasks").set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf).send({ title: "Draft" });
    const id = created.body.task.id;
    const updated = await request(app).patch(`/api/v1/tasks/${id}`).set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf).send({ title: "Final draft", version: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.task).toMatchObject({ title: "Final draft", version: 2 });
    const completed = await request(app).post(`/api/v1/tasks/${id}/complete`).set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf).send({ version: 2 });
    expect(completed.body.task).toMatchObject({ status: "COMPLETED", version: 3 });
    expect(completed.body.task.completedAt).toBeTruthy();
    const reopened = await request(app).post(`/api/v1/tasks/${id}/reopen`).set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf).send({ version: 3 });
    expect(reopened.body.task).toMatchObject({ status: "PENDING", completedAt: null, version: 4 });
    const stale = await request(app).patch(`/api/v1/tasks/${id}`).set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf).send({ title: "stale", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("stores DATETIME deadlines as UTC instants and rejects implicit precision changes", async () => {
    const auth = await register("datetime@example.com");
    const created = await request(app).post("/api/v1/tasks").set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf)
      .send({ title: "Call client", due: { precision: "DATETIME", at: "2026-11-07T10:00:00.000Z", timezone: "Asia/Kolkata" } });
    expect(created.status).toBe(201);
    expect(created.body.task.due).toEqual({ precision: "DATETIME", at: "2026-11-07T10:00:00.000Z", timezone: "Asia/Kolkata" });
    expect(tasks.get(created.body.task.id).dueAt).toBeInstanceOf(Date);
    const changedPrecision = await request(app).patch(`/api/v1/tasks/${created.body.task.id}`)
      .set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf)
      .send({ version: 1, due: { precision: "DATE", date: "2026-11-08", timezone: "Asia/Kolkata" } });
    expect(changedPrecision.status).toBe(400);
    expect(changedPrecision.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid input, missing authentication, and cross-user access", async () => {
    const first = await register("owner@example.com");
    const second = await register("other@example.com");
    const preAuth = await request(app).get("/api/v1/auth/csrf");
    const unauthenticated = await request(app).post("/api/v1/tasks")
      .set("Cookie", cookieFrom(preAuth, "preauth_session"))
      .set("X-CSRF-Token", preAuth.body.csrfToken)
      .send({ title: "No authenticated session" });
    expect(unauthenticated.status).toBe(401);
    const invalid = await request(app).post("/api/v1/tasks").set("Cookie", first.cookie).set("X-CSRF-Token", first.csrf)
      .send({ title: "Bad date", due: { precision: "DATE", date: "2026-02-31", timezone: "Asia/Kolkata" } });
    expect(invalid.status).toBe(400);
    const created = await request(app).post("/api/v1/tasks").set("Cookie", first.cookie).set("X-CSRF-Token", first.csrf).send({ title: "Private" });
    const stolen = await request(app).get(`/api/v1/tasks/${created.body.task.id}`).set("Cookie", second.cookie);
    expect(stolen.status).toBe(404);
    expect(stolen.body.error.code).toBe("NOT_FOUND");
  });

  it("soft-deletes atomically without exposing deleted tasks in ordinary reads", async () => {
    const auth = await register("delete@example.com");
    const created = await request(app).post("/api/v1/tasks").set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf).send({ title: "Remove later" });
    const result = await softDeleteTask({ taskId: created.body.task.id, userId: auth.userId, version: 1 });
    expect(result.deletedAt).toBeInstanceOf(Date);
    expect(result.version).toBe(2);
    expect(await request(app).get(`/api/v1/tasks/${created.body.task.id}`).set("Cookie", auth.cookie).then((res) => res.status)).toBe(404);
    expect((await request(app).get("/api/v1/tasks").set("Cookie", auth.cookie)).body.items).toHaveLength(0);
  });
});
