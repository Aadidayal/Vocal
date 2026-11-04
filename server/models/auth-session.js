import mongoose from "mongoose";

const authSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    csrfTokenHash: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    lastSeenAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    renewedAt: { type: Date, required: true },
  },
  { collection: "sessions", versionKey: false },
);

authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ idleExpiresAt: 1, absoluteExpiresAt: 1 });
authSessionSchema.index({ idleExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSession = mongoose.model("AuthSession", authSessionSchema);
