const API_ROOT = "/api/v1";
let csrfToken = null;

export class ApiError extends Error {
  constructor(message, status, code, details = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const upperMethod = method.toUpperCase();
  const requestHeaders = { Accept: "application/json", ...headers };
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  const changesState = ["POST", "PUT", "PATCH", "DELETE"].includes(upperMethod);
  if (changesState) {
    if (!csrfToken) await bootstrapCsrf();
    requestHeaders["X-CSRF-Token"] = csrfToken;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(`${API_ROOT}${path}`, {
        method: upperMethod,
        credentials: "include",
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError("Could not reach the server. Check that the API is running and try again.", 0, "NETWORK_ERROR");
    }

    const rotatedToken = response.headers.get("X-CSRF-Token");
    if (rotatedToken) csrfToken = rotatedToken;
    if (response.status === 204) return null;

    const payload = await response.json().catch(() => ({}));
    const error = payload.error || {};
    const staleCsrf = response.status === 403 && error.message === "A valid session-bound CSRF token is required.";
    if (staleCsrf && changesState && attempt === 0) {
      csrfToken = null;
      await bootstrapCsrf();
      requestHeaders["X-CSRF-Token"] = csrfToken;
      continue;
    }
    if (!response.ok) {
      if (response.status === 401) csrfToken = null;
      throw new ApiError(error.message || "The request could not be completed.", response.status, error.code, error.details);
    }
    return payload;
  }
  throw new ApiError("The request could not be completed.", 403, "FORBIDDEN");
}

export async function bootstrapCsrf() {
  const payload = await request("/auth/csrf");
  csrfToken = payload.csrfToken;
  return csrfToken;
}

export async function restoreSession() {
  await bootstrapCsrf();
  try {
    const payload = await request("/auth/session");
    return payload.user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

export async function registerAccount(input) {
  const payload = await request("/auth/register", { method: "POST", body: input });
  await bootstrapCsrf();
  return payload.user;
}

export async function loginAccount(input) {
  const payload = await request("/auth/login", { method: "POST", body: input });
  await bootstrapCsrf();
  return payload.user;
}

export async function logoutAccount() {
  await request("/auth/logout", { method: "POST", body: {} });
  csrfToken = null;
  await bootstrapCsrf();
}

export function apiGet(path) {
  return request(path);
}

export function apiMutation(path, method, body) {
  return request(path, { method, body });
}
