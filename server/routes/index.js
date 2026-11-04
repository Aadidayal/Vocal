import express from "express";
import { authRouter } from "./auth.js";
import { tasksRouter } from "./tasks.js";
import { assistantRouter } from "./assistant.js";
import { grievancesRouter } from "./grievances.js";

export const apiRouter = express.Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/tasks", tasksRouter);
apiRouter.use("/assistant", assistantRouter);
apiRouter.use("/grievances", grievancesRouter);

apiRouter.get("/", (_req, res) => {
  res.status(200).json({ data: { service: "ai-task-manager-api" } });
});
