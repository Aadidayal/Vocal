import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretTaskCommand } from "../services/gemini-provider.js";

afterEach(() => vi.unstubAllEnvs());

function input(fetchImpl) {
  vi.stubEnv("GEMINI_API_KEY", "test-only-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
  return interpretTaskCommand({ text: "Add a task", timezone: "UTC", now: new Date(), tasks: [], fetchImpl });
}

describe("Gemini provider failures", () => {
  it.each([
    [503, "AI_TEMPORARILY_UNAVAILABLE", 503],
    [429, "AI_QUOTA_EXCEEDED", 429],
  ])("maps HTTP %s without retrying", async (httpStatus, code, expectedStatus) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: httpStatus === 429 ? { status: "RESOURCE_EXHAUSTED" } : { status: "UNAVAILABLE" } }), { status: httpStatus }));
    await expect(input(fetchImpl)).rejects.toMatchObject({ code, statusCode: expectedStatus });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a timeout and does not retry", async () => {
    const fetchImpl = vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); });
    await expect(input(fetchImpl)).rejects.toMatchObject({ code: "AI_TIMEOUT", statusCode: 504 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps network failures without exposing the underlying error", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("socket failed with private detail"); });
    await expect(input(fetchImpl)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", statusCode: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed model output", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }), { status: 200 }));
    await expect(input(fetchImpl)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", statusCode: 502 });
  });
});
