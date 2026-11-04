const allowedMethods = "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS";
const allowedHeaders = "Content-Type, X-CSRF-Token, Idempotency-Key";

function parseAllowlist(value) {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error("CORS_ALLOWED_ORIGINS must contain at least one origin");

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("CORS_ALLOWED_ORIGINS contains an invalid origin");
    }
    if (parsed.origin !== origin || parsed.origin === "null" || origin === "*") {
      throw new Error("CORS_ALLOWED_ORIGINS entries must be exact origins without paths or wildcards");
    }
  }
  return new Set(origins);
}

export function createCorsMiddleware(allowlistValue) {
  const allowedOrigins = parseAllowlist(allowlistValue);

  return function corsMiddleware(req, res, next) {
    const origin = req.get("Origin");
    res.vary("Origin");

    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "The request origin is not allowed.",
          details: [],
          requestId: req.requestId,
        },
      });
    }

    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Expose-Headers", "X-Request-Id, X-CSRF-Token");
    }

    if (req.method === "OPTIONS") {
      res.vary("Access-Control-Request-Method");
      res.vary("Access-Control-Request-Headers");
      if (!origin) return res.status(400).end();
      res.setHeader("Access-Control-Allow-Methods", allowedMethods);
      res.setHeader("Access-Control-Allow-Headers", allowedHeaders);
      res.setHeader("Access-Control-Max-Age", "600");
      return res.status(204).end();
    }

    return next();
  };
}
