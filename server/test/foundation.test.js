import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { loadEnvironment } from "../config/env.js";
import { errorHandler, notFoundHandler } from "../middleware/errors.js";
import { requestIdMiddleware } from "../middleware/request-id.js";

const corsAllowedOrigins = "http://localhost:5173";

function createTestApp(getConnectionState = () => "disconnected") {
  return createApp({ corsAllowedOrigins, getConnectionState });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment validation", () => {
  it("rejects missing required variables", () => {
    expect(() => loadEnvironment({})).toThrow(/MONGODB_URI/);
    expect(() => loadEnvironment({
      MONGODB_URI: "mongodb://localhost/db",
      PORT: "3000",
    })).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() => loadEnvironment({
      MONGODB_URI: "mongodb://localhost/db",
      CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    })).toThrow(/PORT/);
  });

  it("accepts a valid MongoDB URI and complete configuration", () => {
    const config = loadEnvironment({
      MONGODB_URI: "mongodb://localhost:27017/ai_task_manager?replicaSet=rs0",
      PORT: "3000",
      CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    });

    expect(config).toEqual({
      MONGODB_URI: "mongodb://localhost:27017/ai_task_manager?replicaSet=rs0",
      PORT: 3000,
      CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    });
  });

  it("rejects invalid ports", () => {
    expect(() => loadEnvironment({
      MONGODB_URI: "mongodb://localhost/db",
      PORT: "not-a-port",
      CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    })).toThrow(/PORT/);

    expect(() => loadEnvironment({
      MONGODB_URI: "mongodb://localhost/db",
      PORT: "70000",
      CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    })).toThrow(/PORT/);
  });
});

describe("request IDs", () => {
  it("generates a request ID, ignores the client value, and returns the ID header", async () => {
    const response = await request(createTestApp())
      .get("/health")
      .set("X-Request-Id", "client-controlled-id");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers["x-request-id"]).not.toBe("client-controlled-id");
  });
});

describe("normalized error responses", () => {
  it("returns the normalized not-found envelope with a request ID", async () => {
    const response = await request(createTestApp()).get("/missing-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        details: [],
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("hides unexpected production errors, stack traces, and connection secrets", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const loggedErrors = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "mongodb://invalid.invalid/test-only";
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/unexpected", () => {
      throw new Error(secret);
    });
    app.use(notFoundHandler);
    app.use(errorHandler);

    const response = await request(app)
      .get("/unexpected")
      .set("X-Request-Id", "untrusted-client-id");
    const serializedResponse = JSON.stringify(response.body);
    const serializedLogs = loggedErrors.mock.calls.map(([entry]) => entry).join("\n");

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      details: [],
      requestId: response.headers["x-request-id"],
    });
    expect(response.headers["x-request-id"]).not.toBe("untrusted-client-id");
    expect(serializedResponse).not.toContain(secret);
    expect(serializedResponse).not.toContain("stack");
    expect(serializedLogs).not.toContain(secret);
  });
});

describe("health and readiness", () => {
  it("returns liveness while MongoDB is disconnected", async () => {
    const response = await request(createTestApp(() => "disconnected")).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns ready when the existing database connection is connected", async () => {
    const response = await request(createTestApp(() => "connected")).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { status: "ready", dependencies: { mongodb: "connected" } },
    });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns not ready when MongoDB is disconnected without exposing credentials", async () => {
    const response = await request(createTestApp(() => "disconnected")).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      data: { status: "not_ready", dependencies: { mongodb: "disconnected" } },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/mongodb:\/\/|password|credential/i);
    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});
