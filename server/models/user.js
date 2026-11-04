import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ["USER", "ADMIN"], default: "USER", required: true },
    emailVerifiedAt: { type: Date, default: null },
    passwordHash: { type: String, required: true, select: false },
    preferredName: { type: String, required: true, trim: true, maxlength: 80 },
    timezone: { type: String, required: true },
    language: { type: String, default: "en" },
    voiceEnabled: { type: Boolean, default: false },
    notificationPreferences: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    onboardingComplete: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null },
  },
  { collection: "users", timestamps: true },
);

export const User = mongoose.model("User", userSchema);
