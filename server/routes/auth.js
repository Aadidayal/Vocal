import { randomBytes } from "node:crypto";
import express from "express";
import { z } from "zod";
import { AuthSession } from "../models/auth-session.js";
import { PreAuthSession } from "../models/pre-auth-session.js";
import { User } from "../models/user.js";
import { authSessionLifetimes, requireAuthenticatedSession } from "../middleware/authenticate.js";
import { createAuthRateLimit } from "../middleware/auth-rate-limit.js";
import {
  AUTH_SESSION_COOKIE,
  clearAuthSessionCookie,
  clearPreAuthCookie,
  hashSecret,
  PRE_AUTH_COOKIE,
  PRE_AUTH_TTL_MS,
  readCookie,
  setAuthSessionCookie,
  setPreAuthCookie,
} from "../middleware/csrf.js";
import { hashPassword, verifyPassword } from "../services/password.js";

export const authRouter = express.Router();

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  preferredName: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).refine(isIanaTimezone, "Must be a valid IANA timezone"),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

const authRateLimit = createAuthRateLimit();
const dummyPasswordHash = hashPassword(randomBytes(32).toString("base64url"));

authRouter.get("/csrf", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    const now = new Date();
    const authToken = readCookie(req, AUTH_SESSION_COOKIE);

    if (authToken) {
      const authSession = await AuthSession.findOne({ tokenHash: hashSecret(authToken), revokedAt: null });
      if (isActiveSession(authSession, now)) {
        const csrfToken = randomBytes(32).toString("base64url");
        authSession.csrfTokenHash = hashSecret(csrfToken);
        await authSession.save();
        setAuthSessionCookie(res, authToken, authSession.idleExpiresAt);
        return res.status(200).json({ csrfToken });
      }
      clearAuthSessionCookie(res);
    }

    const cookieSessionId = readCookie(req, PRE_AUTH_COOKIE);
    let session = cookieSessionId
      ? await PreAuthSession.findOne({ sessionIdHash: hashSecret(cookieSessionId) })
      : null;

    if (!session || session.expiresAt.getTime() <= now.getTime()) {
      const sessionId = randomBytes(32).toString("base64url");
      const csrfToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now.getTime() + PRE_AUTH_TTL_MS);
      session = await PreAuthSession.create({
        sessionIdHash: hashSecret(sessionId),
        csrfTokenHash: hashSecret(csrfToken),
        createdAt: now,
        expiresAt,
      });
      setPreAuthCookie(res, sessionId, expiresAt);
      return res.status(200).json({ csrfToken });
    }

    // Raw CSRF values are never persisted; bootstrap rotates the stored hash.
    const csrfToken = randomBytes(32).toString("base64url");
    session.csrfTokenHash = hashSecret(csrfToken);
    await session.save();
    setPreAuthCookie(res, cookieSessionId, session.expiresAt);
    return res.status(200).json({ csrfToken });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/register", authRateLimit, async (req, res, next) => {
  try {
    const body = parseBody(registerSchema, req.body);
    const user = await User.create({
      email: body.email.toLowerCase(),
      passwordHash: await hashPassword(body.password),
      preferredName: body.preferredName,
      timezone: body.timezone,
    });

    await createAuthenticatedSession(user, req, res);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "An account with that email already exists.",
          details: [],
          requestId: req.requestId,
        },
      });
    }
    return next(error);
  }
});

authRouter.post("/login", authRateLimit, async (req, res, next) => {
  try {
    const body = parseBody(loginSchema, req.body);
    const user = await User.findOne({ email: body.email.toLowerCase(), deletedAt: null })
      .select("+passwordHash");
    const storedHash = user?.passwordHash || await dummyPasswordHash;
    const passwordMatches = await verifyPassword(body.password, storedHash);

    if (!user || !passwordMatches) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Email or password is incorrect.",
          details: [],
          requestId: req.requestId,
        },
      });
    }

    await createAuthenticatedSession(user, req, res);
    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

const requireSession = requireAuthenticatedSession();

authRouter.get("/session", requireSession, (req, res) => {
  return res.status(200).json({
    user: publicUser(req.user),
    expiresAt: req.authSession.idleExpiresAt.toISOString(),
  });
});

authRouter.post("/logout", requireSession, async (req, res, next) => {
  try {
    req.authSession.revokedAt = new Date();
    await req.authSession.save();
    clearAuthSessionCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

async function createAuthenticatedSession(user, req, res) {
  const now = new Date();
  const sessionId = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const absoluteExpiresAt = new Date(now.getTime() + authSessionLifetimes.ABSOLUTE_TTL_MS);
  const idleExpiresAt = new Date(Math.min(
    now.getTime() + authSessionLifetimes.IDLE_TTL_MS,
    absoluteExpiresAt.getTime(),
  ));

  await AuthSession.create({
    userId: user._id,
    tokenHash: hashSecret(sessionId),
    csrfTokenHash: hashSecret(csrfToken),
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
    revokedAt: null,
    renewedAt: now,
  });

  if (req.preAuthSession) {
    req.preAuthSession.expiresAt = now;
    await req.preAuthSession.save();
  }

  setAuthSessionCookie(res, sessionId, idleExpiresAt);
  clearPreAuthCookie(res);
}

function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const error = new Error("Request validation failed.");
  error.statusCode = 400;
  error.code = "VALIDATION_ERROR";
  error.details = result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  throw error;
}

function isIanaTimezone(timezone) {
  try {
    return Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

function isActiveSession(session, now) {
  return Boolean(
    session &&
    !session.revokedAt &&
    session.idleExpiresAt.getTime() > now.getTime() &&
    session.absoluteExpiresAt.getTime() > now.getTime(),
  );
}

function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    preferredName: user.preferredName,
    timezone: user.timezone,
    role: user.role || "USER",
    language: user.language,
    voiceEnabled: user.voiceEnabled,
    notificationPreferences: user.notificationPreferences,
    onboardingComplete: user.onboardingComplete,
    version: user.version,
  };
}
