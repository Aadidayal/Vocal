import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { loadEnvironment } from "./config/env.js";

const env = loadEnvironment({ ...process.env, PORT: process.env.PORT || "5000" });
const platformOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter((host) => typeof host === "string" && /^[a-zA-Z0-9.-]+$/.test(host))
  .map((host) => `https://${host}`);
const corsAllowedOrigins = [...new Set([
  ...env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  ...platformOrigins,
])].join(",");

const app = createApp({
  corsAllowedOrigins,
  beforeRequest: async (req) => {
    if (req.path === "/health") return;
    try {
      await connectDatabase(env.MONGODB_URI);
    } catch (error) {
      // Keep readiness observable during an Atlas outage; it reports MongoDB as
      // disconnected. Business/API requests still fail through safe middleware.
      if (req.path === "/ready") return;
      throw error;
    }
  },
});

export default app;
