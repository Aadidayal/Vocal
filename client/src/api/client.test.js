import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiMutation, bootstrapCsrf } from "./client.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ csrfToken: "bootstrap-token" }));
  vi.stubGlobal("fetch", fetchMock);
  await bootstrapCsrf();
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("API client CSRF recovery", () => {
  it("refreshes and retries once when a mutation is rejected for a stale CSRF token", async () => {
    const fetchMock = globalThis.fetch;
    const sentHeaders = [];
    const replies = [
      jsonResponse({ error: { code: "FORBIDDEN", message: "A valid session-bound CSRF token is required." } }, 403),
      jsonResponse({ csrfToken: "refreshed-token" }),
      jsonResponse({ data: { ok: true } }),
    ];
    fetchMock.mockImplementation(async (_url, options) => { sentHeaders.push({ ...options.headers }); return replies.shift(); });

    const result = await apiMutation("/tasks", "POST", { title: "Test" });

    expect(result.data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentHeaders[0]["X-CSRF-Token"]).toBe("bootstrap-token");
    expect(sentHeaders[2]["X-CSRF-Token"]).toBe("refreshed-token");
    expect(fetchMock.mock.calls.every(([, options]) => options.credentials === "include")).toBe(true);
  });

  it("does not retry unrelated authorization failures", async () => {
    const fetchMock = globalThis.fetch;
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "FORBIDDEN", message: "Administrator access is required." } }, 403));
    await expect(apiMutation("/grievances/admin", "PATCH", {})).rejects.toMatchObject({ status: 403, message: "Administrator access is required." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
