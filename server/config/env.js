import { z } from "zod";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const environmentSchema = z.object({
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required"),
  PORT: z.coerce.number().int().min(1).max(65535),
  CORS_ALLOWED_ORIGINS: z.string().trim().min(1, "CORS_ALLOWED_ORIGINS is required"),
});

/**
 * Validate server environment configuration before starting the API/worker.
 * @param {NodeJS.ProcessEnv} source
 * @returns {{ MONGODB_URI: string, PORT: number, CORS_ALLOWED_ORIGINS: string }}
 */
export function loadEnvironment(source = process.env) {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map(({ path, message }) => `${path.join(".")}: ${message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }

  return result.data;
}
