import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createCsrfProtection } from "./middleware/csrf.js";
import { apiRouter } from "./routes/index.js";
import { createOperationsRouter } from "./routes/operations.js";
import { log } from "./shared/logger.js";

const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../client/dist");

export function createApp({ corsAllowedOrigins, clock, getConnectionState, beforeRequest } = {}) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(createCorsMiddleware(corsAllowedOrigins));
  app.use(express.json({ limit: "100kb" }));
  app.use((req, res, next) => {
    res.on("finish", () => {
      log("info", "http_request_completed", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
      });
    });
    next();
  });

  if (beforeRequest) {
    app.use((req, res, next) => {
      Promise.resolve(beforeRequest(req)).then(() => next()).catch(next);
    });
  }

  app.use(createOperationsRouter({ getConnectionState }));
  app.use("/api/v1", createCsrfProtection({ clock }), apiRouter);

  if (existsSync(resolve(clientDist, "index.html"))) {
    app.use(express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || ["/health", "/ready"].includes(req.path)) return next();
      if (!req.get("Accept")?.includes("text/html")) return next();
      return res.sendFile(resolve(clientDist, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
