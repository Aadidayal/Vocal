import mongoose from "mongoose";
import { log } from "../shared/logger.js";

export async function connectDatabase(uri) {
  await mongoose.connect(uri);
  log("info", "mongodb_connected", { readyState: mongoose.connection.readyState });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

/** Return a safe name for the existing Mongoose connection's state. */
export function getMongoConnectionState() {
  switch (mongoose.connection.readyState) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "disconnected";
  }
}
