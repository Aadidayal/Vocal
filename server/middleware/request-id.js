import { randomUUID } from "node:crypto";

/** Assign a server-generated correlation ID; client-supplied IDs are ignored. */
export function requestIdMiddleware(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
