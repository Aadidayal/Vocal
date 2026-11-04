import { log } from "../shared/logger.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
      details: [],
      requestId: req.requestId,
    },
  });
}

export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  const exposeSafeError = status < 500 || (typeof err.code === "string" && err.code.startsWith("AI_"));
  const code = exposeSafeError ? (err.code || "REQUEST_ERROR") : "INTERNAL_ERROR";
  const message = exposeSafeError ? err.message : "An unexpected error occurred.";

  log("error", "http_request_failed", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status,
    code,
    errorName: err.name || "Error",
  });

  res.status(status).json({
    error: {
      code,
      message,
      details: exposeSafeError ? (Array.isArray(err.details) ? err.details : []) : [],
      requestId: req.requestId,
    },
  });
}
