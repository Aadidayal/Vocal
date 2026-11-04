import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { log } from "./shared/logger.js";

const { MONGODB_URI, PORT, CORS_ALLOWED_ORIGINS } = loadEnvironment();
await connectDatabase(MONGODB_URI);
const app = createApp({ corsAllowedOrigins: CORS_ALLOWED_ORIGINS });
const server = app.listen(PORT, "0.0.0.0", () => {
  log("info", "api_server_started", { port: PORT, environment: process.env.NODE_ENV || "development" });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      disconnectDatabase().finally(() => {
        log("info", "api_server_stopped", { signal });
        process.exit(0);
      });
    });
  });
}
