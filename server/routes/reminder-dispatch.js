import express from "express";
import { User } from "../models/user.js";
import { Task } from "../models/task.js";
import { sendReminderEmail } from "../services/email-provider.js";
import { log } from "../shared/logger.js";

export const reminderDispatchRouter = express.Router();

reminderDispatchRouter.get("/", async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;
    if (!secret || req.get("authorization") !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
    const now = new Date();
    const due = await Task.find({ reminderAt: { $lte: now }, reminderSentAt: null, reminderAttemptedAt: null, $or: [{ reminderAttempts: { $exists: false } }, { reminderAttempts: { $lt: 5 } }], deletedAt: null, status: { $in: ["PENDING", "IN_PROGRESS"] } }).sort({ reminderAt: 1 }).limit(30);
    let sent = 0;
    let failed = 0;
    for (const candidate of due) {
      const claim = await Task.findOneAndUpdate(
        { _id: candidate._id, reminderAt: candidate.reminderAt, reminderSentAt: null, reminderAttemptedAt: null, $or: [{ reminderAttempts: { $exists: false } }, { reminderAttempts: { $lt: 5 } }], deletedAt: null, status: { $in: ["PENDING", "IN_PROGRESS"] } },
        { $set: { reminderAttemptedAt: now }, $inc: { reminderAttempts: 1 } },
        { new: true },
      );
      if (!claim) continue;
      try {
        const user = await User.findOne({ _id: claim.userId, deletedAt: null }).select("email preferredName timezone");
        if (!user?.email) throw new Error("Reminder recipient is unavailable.");
        await sendReminderEmail({ to: user.email, taskTitle: claim.title, scheduledAt: claim.reminderAt, timezone: claim.dueTimezone || user.timezone });
        await Task.updateOne({ _id: claim._id, reminderAttemptedAt: now, reminderSentAt: null }, { $set: { reminderSentAt: new Date() } });
        sent += 1;
      } catch (error) {
        if ((claim.reminderAttempts || 0) < 5) {
          await Task.updateOne({ _id: claim._id, reminderAttemptedAt: now, reminderSentAt: null }, { $set: { reminderAttemptedAt: null } });
        }
        log("error", "task_reminder_email_failed", { taskId: String(claim._id), attempts: claim.reminderAttempts || 1, errorName: error?.name || "Error", errorCode: error?.code || "EMAIL_DELIVERY_FAILED" });
        failed += 1;
      }
    }
    return res.json({ sent, failed });
  } catch (error) { return next(error); }
});
