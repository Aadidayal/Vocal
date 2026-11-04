import mongoose from "mongoose";

export const TASK_PRIORITIES = Object.freeze(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const TASK_STATUSES = Object.freeze(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 5000 },
    priority: { type: String, enum: TASK_PRIORITIES, default: "MEDIUM", required: true },
    status: { type: String, enum: TASK_STATUSES, default: "PENDING", required: true },
    duePrecision: { type: String, enum: ["DATE", "DATETIME"], default: null },
    dueDate: { type: String, default: null },
    dueAt: { type: Date, default: null },
    dueTimezone: { type: String, default: null },
    completedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    version: { type: Number, default: 1, min: 1, required: true },
  },
  { collection: "tasks", timestamps: true, versionKey: false },
);

taskSchema.index({ userId: 1, deletedAt: 1, status: 1, dueAt: 1 });
taskSchema.index({ userId: 1, deletedAt: 1, dueDate: 1 });
taskSchema.index({ userId: 1, deletedAt: 1, priority: 1 });
taskSchema.index({ userId: 1, updatedAt: 1 });
taskSchema.pre("validate", function validateDueShape() {
  const valid = this.duePrecision === null
    ? this.dueDate === null && this.dueAt === null && this.dueTimezone === null
    : this.duePrecision === "DATE"
      ? typeof this.dueDate === "string" && this.dueAt === null && Boolean(this.dueTimezone)
      : this.duePrecision === "DATETIME"
        ? this.dueDate === null && this.dueAt instanceof Date && Boolean(this.dueTimezone)
        : false;
  if (!valid) this.invalidate("duePrecision", "Due date fields must match their precision.");
});

export const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);

/** Soft-delete a task with owner and optimistic-version guards. */
export async function softDeleteTask({ taskId, userId, version, now = new Date() }) {
  return Task.findOneAndUpdate(
    { _id: taskId, userId, deletedAt: null, version },
    { $set: { deletedAt: now }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
}
