import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { AuthSession } from "../models/auth-session.js";
import { PreAuthSession } from "../models/pre-auth-session.js";
import { User } from "../models/user.js";
import { hashSecret } from "../middleware/csrf.js";
import { hashPassword, verifyPassword } from "../services/password.js";

const app = createApp({ corsAllowedOrigins: "http://localhost:5173" });
const sessions = new Map();
const preAuthSessions = new Map();
let testUser;
let createdAuthSession;

function chainableUserQuery(user) {
  const promise = Promise.resolve(user);
  return {
    select: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function parseCookie(cookie) {
  return cookie.split(";")[0];
}

beforeEach(() => {
  sessions.clear();
  preAuthSessions.clear();
  createdAuthSession = null;
  testUser = {
    _id: "user-test-1",
    email: "aadi@example.com",
    preferredName: "Aadi",
    timezone: "Asia/Kolkata",
    language: "en",
    voiceEnabled: false,
    notificationPreferences: {},
    onboardingComplete: false,
    version: 1,
    deletedAt: null,
  };

  vi.spyOn(PreAuthSession, "findOne").mockImplementation(async (filter) =>
    [...preAuthSessions.values()].find((session) => session.sessionIdHash === filter.sessionIdHash) || null);
  vi.spyOn(PreAuthSession, "create").mockImplementation(async (fields) => {
    const session = { ...fields, _id: "preauth-test-1", save: vi.fn(async () => {}) };
    preAuthSessions.set(session.sessionIdHash, session);
    return session;
  });
  vi.spyOn(AuthSession, "findOne").mockImplementation(async (filter) =>
    [...sessions.values()].find((session) => session.tokenHash === filter.tokenHash) || null);
  vi.spyOn(AuthSession, "create").mockImplementation(async (fields) => {
    createdAuthSession = { ...fields, save: vi.fn(async function save() {}) };
    sessions.set(fields.tokenHash, createdAuthSession);
    return createdAuthSession;
  });
  vi.spyOn(User, "create").mockImplementation(async (fields) => {
    testUser = { ...testUser, ...fields };
    return testUser;
  });
  vi.spyOn(User, "findOne").mockImplementation(() => chainableUserQuery(testUser));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function bootstrapPreAuth() {
  const response = await request(app).get("/api/v1/auth/csrf");
  return {
    csrfToken: response.body.csrfToken,
    cookie: parseCookie(response.headers["set-cookie"].find((cookie) => cookie.startsWith("preauth_session="))),
  };
}

describe("password hashing", () => {
  it("stores a salted scrypt hash and verifies without storing the raw password", async () => {
    const password = "correct-horse-battery-staple";
    const encoded = await hashPassword(password);

    expect(encoded).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", encoded)).resolves.toBe(false);
  });
});

describe("anonymous CSRF to authenticated session lifecycle", () => {
  it("registers with a confirmed timezone, issues a hashed server session, restores it, and logs out", async () => {
    const preAuth = await bootstrapPreAuth();
    const registration = await request(app)
      .post("/api/v1/auth/register")
      .set("Cookie", preAuth.cookie)
      .set("X-CSRF-Token", preAuth.csrfToken)
      .send({
        email: "Aadi@Example.com",
        password: "correct-horse-battery-staple",
        preferredName: "Aadi",
        timezone: "Asia/Kolkata",
      });

    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({
      email: "aadi@example.com",
      preferredName: "Aadi",
      timezone: "Asia/Kolkata",
    });
    expect(registration.body.user.passwordHash).toBeUndefined();
    expect(testUser.passwordHash).toMatch(/^scrypt\$/);

    const cookies = registration.headers["set-cookie"];
    const sessionCookie = parseCookie(cookies.find((cookie) => cookie.startsWith("session=")));
    expect(cookies.some((cookie) => cookie.startsWith("preauth_session=;"))).toBe(true);
    expect(cookies.find((cookie) => cookie.startsWith("session="))).toMatch(/HttpOnly/);
    expect(cookies.find((cookie) => cookie.startsWith("session="))).toMatch(/SameSite=Lax/);
    const rawSessionId = decodeURIComponent(sessionCookie.slice("session=".length));
    expect(createdAuthSession.tokenHash).toBe(hashSecret(rawSessionId));
    expect(createdAuthSession.tokenHash).not.toBe(rawSessionId);
    expect(preAuthSessions.values().next().value.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(createdAuthSession.idleExpiresAt.getTime()).toBeLessThanOrEqual(
      createdAuthSession.absoluteExpiresAt.getTime(),
    );

    const sessionCsrf = await request(app)
      .get("/api/v1/auth/csrf")
      .set("Cookie", sessionCookie);
    expect(sessionCsrf.status).toBe(200);

    const restored = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", sessionCookie);
    expect(restored.status).toBe(200);
    expect(restored.body.user.email).toBe("aadi@example.com");
    expect(restored.body.user.passwordHash).toBeUndefined();

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", sessionCookie)
      .set("X-CSRF-Token", sessionCsrf.body.csrfToken);
    expect(logout.status).toBe(204);
    expect(createdAuthSession.revokedAt).toBeInstanceOf(Date);

    const revokedSession = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", sessionCookie);
    expect(revokedSession.status).toBe(401);
  });

  it("rejects registration with an invalid timezone or weak password", async () => {
    const preAuth = await bootstrapPreAuth();
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Cookie", preAuth.cookie)
      .set("X-CSRF-Token", preAuth.csrfToken)
      .send({
        email: "aadi@example.com",
        password: "short",
        preferredName: "Aadi",
        timezone: "Not/A_Real_Zone",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(User.create).not.toHaveBeenCalled();
  });

  it("rejects state-changing authentication requests without CSRF", async () => {
    const preAuth = await bootstrapPreAuth();
    const response = await request(app)
      .post("/api/v1/auth/register")
      .set("Cookie", preAuth.cookie)
      .send({
        email: "aadi@example.com",
        password: "correct-horse-battery-staple",
        preferredName: "Aadi",
        timezone: "Asia/Kolkata",
      });

    expect(response.status).toBe(403);
    expect(User.create).not.toHaveBeenCalled();
  });

  it("logs in with the same generic failure semantics for bad credentials", async () => {
    testUser.passwordHash = await hashPassword("correct-horse-battery-staple");
    const preAuth = await bootstrapPreAuth();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Cookie", preAuth.cookie)
      .set("X-CSRF-Token", preAuth.csrfToken)
      .send({ email: "AADI@example.com", password: "correct-horse-battery-staple" });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("aadi@example.com");
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(createdAuthSession).toBeTruthy();
  });

  it("uses a generic response for invalid login credentials", async () => {
    User.findOne.mockImplementation(() => chainableUserQuery(null));
    const preAuth = await bootstrapPreAuth();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Cookie", preAuth.cookie)
      .set("X-CSRF-Token", preAuth.csrfToken)
      .send({ email: "unknown@example.com", password: "correct-horse-battery-staple" });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Email or password is incorrect.");
    expect(AuthSession.create).not.toHaveBeenCalled();
  });
});
