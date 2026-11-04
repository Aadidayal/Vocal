import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../config/database.js", () => ({
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
  getMongoConnectionState: vi.fn(() => "disconnected"),
}));

let app;
let connectDatabase;
let getMongoConnectionState;
beforeAll(async () => {
  vi.stubEnv("MONGODB_URI", "mongodb://vercel-test.invalid/daymark");
  vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://daymark.example");
  vi.stubEnv("PORT", "");
  ({ connectDatabase, getMongoConnectionState } = await import("../config/database.js"));
  ({ default: app } = await import("../vercel.js"));
});
afterAll(() => vi.unstubAllEnvs());

describe("Vercel Express entrypoint", () => {
  it("serves liveness without a database connection", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(connectDatabase).not.toHaveBeenCalled();
  });

  it("reports readiness unavailable if lazy MongoDB connection fails", async () => {
    connectDatabase.mockRejectedValueOnce(new Error("test connection failure"));
    getMongoConnectionState.mockReturnValueOnce("disconnected");
    const response = await request(app).get("/ready");
    expect(response.status).toBe(503);
    expect(response.body.data.dependencies.mongodb).toBe("disconnected");
  });

  it("connects lazily before serving API requests", async () => {
    connectDatabase.mockResolvedValueOnce({});
    const response = await request(app).get("/api/v1");
    expect(response.status).toBe(200);
    expect(connectDatabase).toHaveBeenCalledWith("mongodb://vercel-test.invalid/daymark");
  });
});
