import { randomBytes } from "node:crypto";
import { AuthSession } from "../models/auth-session.js";
import { User } from "../models/user.js";
import { hashSecret, AUTH_SESSION_COOKIE, setAuthSessionCookie, readCookie } from "./csrf.js";

const IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const RENEW_INTERVAL_MS = 60 * 60 * 1000;

export function requireAuthenticatedSession({ clock = () => new Date() } = {}) {
  return async function authenticateSession(req, res, next) {
    try {
      const token = readCookie(req, AUTH_SESSION_COOKIE);
      if (!token) return next(unauthenticated(req.requestId));

      const session = await AuthSession.findOne({ tokenHash: hashSecret(token), revokedAt: null });
      const now = clock();
      if (
        !session ||
        session.revokedAt ||
        session.idleExpiresAt.getTime() <= now.getTime() ||
        session.absoluteExpiresAt.getTime() <= now.getTime()
      ) {
        return next(unauthenticated(req.requestId));
      }

      const user = await User.findOne({ _id: session.userId, deletedAt: null });
      if (!user) return next(unauthenticated(req.requestId));

      if (now.getTime() - session.renewedAt.getTime() >= RENEW_INTERVAL_MS) {
        const absoluteExpiry = session.absoluteExpiresAt.getTime();
        session.lastSeenAt = now;
        session.renewedAt = now;
        session.idleExpiresAt = new Date(Math.min(now.getTime() + IDLE_TTL_MS, absoluteExpiry));

        const rotatedCsrfToken = randomBytes(32).toString("base64url");
        session.csrfTokenHash = hashSecret(rotatedCsrfToken);
        await session.save();

        setAuthSessionCookie(res, token, session.idleExpiresAt);
        res.setHeader("X-CSRF-Token", rotatedCsrfToken);
      }

      req.user = user;
      req.authSession = session;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function unauthenticated(requestId) {
  const error = new Error("An active session is required.");
  error.statusCode = 401;
  error.code = "UNAUTHENTICATED";
  error.requestId = requestId;
  return error;
}

export const authSessionLifetimes = Object.freeze({ IDLE_TTL_MS, ABSOLUTE_TTL_MS, RENEW_INTERVAL_MS });
