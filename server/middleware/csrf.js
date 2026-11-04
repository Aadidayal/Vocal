import { createHash, timingSafeEqual } from "node:crypto";
import { PreAuthSession } from "../models/pre-auth-session.js";
import { AuthSession } from "../models/auth-session.js";

export const PRE_AUTH_COOKIE = "preauth_session";
export const AUTH_SESSION_COOKIE = "session";
export const PRE_AUTH_TTL_MS = 30 * 60 * 1000;

export function hashSecret(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashesMatch(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function readCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function setPreAuthCookie(res, sessionId, expiresAt) {
  appendCookie(res, makeCookie(PRE_AUTH_COOKIE, sessionId, expiresAt));
}

export function setAuthSessionCookie(res, sessionId, expiresAt) {
  appendCookie(res, makeCookie(AUTH_SESSION_COOKIE, sessionId, expiresAt));
}

export function clearPreAuthCookie(res) {
  appendCookie(res, makeCookie(PRE_AUTH_COOKIE, "", new Date(0), true));
}

export function clearAuthSessionCookie(res) {
  appendCookie(res, makeCookie(AUTH_SESSION_COOKIE, "", new Date(0), true));
}

function makeCookie(name, value, expiresAt, clear = false) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${clear ? 0 : Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

function appendCookie(res, cookie) {
  if (typeof res.append === "function") res.append("Set-Cookie", cookie);
  else res.setHeader("Set-Cookie", cookie);
}

export function createCsrfProtection({ clock = () => new Date() } = {}) {
  return async function csrfProtection(req, res, next) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

    try {
      const sessionId = readCookie(req, PRE_AUTH_COOKIE);
      const token = req.get("X-CSRF-Token");
      if (!token) {
        return res.status(403).json(csrfError(req.requestId));
      }

      const authenticatedSessionId = readCookie(req, AUTH_SESSION_COOKIE);
      if (authenticatedSessionId) {
        const authSession = await AuthSession.findOne({
          tokenHash: hashSecret(authenticatedSessionId),
          revokedAt: null,
        });
        const now = clock().getTime();
        if (
          !authSession ||
          authSession.idleExpiresAt.getTime() <= now ||
          authSession.absoluteExpiresAt.getTime() <= now ||
          !hashesMatch(hashSecret(token), authSession.csrfTokenHash)
        ) {
          return res.status(403).json(csrfError(req.requestId));
        }
        req.csrfSession = authSession;
        req.csrfSessionType = "authenticated";
        return next();
      }

      if (!sessionId) return res.status(403).json(csrfError(req.requestId));

      const session = await PreAuthSession.findOne({ sessionIdHash: hashSecret(sessionId) });
      if (!session || session.expiresAt.getTime() <= clock().getTime()) {
        return res.status(403).json(csrfError(req.requestId));
      }

      if (!hashesMatch(hashSecret(token), session.csrfTokenHash)) {
        return res.status(403).json(csrfError(req.requestId));
      }

      req.preAuthSession = session;
      req.csrfSessionType = "pre-auth";
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function csrfError(requestId) {
  return {
    error: {
      code: "FORBIDDEN",
      message: "A valid session-bound CSRF token is required.",
      details: [],
      requestId,
    },
  };
}
