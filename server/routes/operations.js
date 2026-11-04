import express from "express";
import { getMongoConnectionState } from "../config/database.js";

export function createOperationsRouter({ getConnectionState = getMongoConnectionState } = {}) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({ data: { status: "ok" } });
  });

  router.get("/ready", (_req, res) => {
    const mongodb = getConnectionState();
    const ready = mongodb === "connected";

    res.status(ready ? 200 : 503).json({
      data: {
        status: ready ? "ready" : "not_ready",
        dependencies: { mongodb },
      },
    });
  });

  return router;
}
