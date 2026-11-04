const buckets = new Map();

export function createAuthRateLimit({ limit = 10, windowMs = 15 * 60 * 1000, clock = Date.now } = {}) {
  return function authRateLimit(req, res, next) {
    const key = `${req.ip || "unknown"}:${req.path}`;
    const now = clock();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many authentication attempts. Try again later.",
          details: [],
          requestId: req.requestId,
        },
      });
    }

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    return next();
  };
}
