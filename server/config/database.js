import mongoose from "mongoose";
import { log } from "../shared/logger.js";

let connectionPromise = null;

export async function connectDatabase(uri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    const pending = mongoose.connect(uri)
      .then((connection) => {
        log("info", "mongodb_connected", { readyState: mongoose.connection.readyState });
        return connection;
      });
    connectionPromise = pending;
  }
  const pending = connectionPromise;
  try {
    return await pending;
  } finally {
    if (connectionPromise === pending) connectionPromise = null;
  }
}

export async function disconnectDatabase() {
  connectionPromise = null;
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
