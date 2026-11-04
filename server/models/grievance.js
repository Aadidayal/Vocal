import mongoose from "mongoose";

export const GRIEVANCE_CATEGORIES = ["Infrastructure", "Electricity", "Water", "Cleanliness", "Academics", "Transport", "IT Support", "Other"];
export const GRIEVANCE_PRIORITIES = ["Low", "Medium", "High", "Critical"];
export const GRIEVANCE_STATUSES = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "REJECTED"];

const historySchema = new mongoose.Schema({ status: { type: String, enum: GRIEVANCE_STATUSES, required: true }, note: { type: String, maxlength: 2000, default: "" }, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, changedAt: { type: Date, required: true } }, { _id: false });
const grievanceSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  category: { type: String, enum: GRIEVANCE_CATEGORIES, required: true },
  location: { type: String, trim: true, maxlength: 200, default: "" },
  priority: { type: String, enum: GRIEVANCE_PRIORITIES, required: true, default: "Medium" },
  occurredAt: { type: Date, default: null },
  status: { type: String, enum: GRIEVANCE_STATUSES, required: true, default: "OPEN" },
  resolutionNotes: { type: String, trim: true, maxlength: 4000, default: "" },
  history: { type: [historySchema], default: [] },
  version: { type: Number, default: 1 },
}, { collection: "grievances", timestamps: true });
grievanceSchema.index({ ownerId: 1, createdAt: -1 });
grievanceSchema.index({ status: 1, category: 1, priority: 1, createdAt: -1 });

export const Grievance = mongoose.model("Grievance", grievanceSchema);
