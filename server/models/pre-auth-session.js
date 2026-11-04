import mongoose from "mongoose";

const preAuthSessionSchema = new mongoose.Schema(
  {
    sessionIdHash: { type: String, required: true, unique: true },
    csrfTokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: "preAuthSessions",
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

preAuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PreAuthSession = mongoose.model("PreAuthSession", preAuthSessionSchema);
