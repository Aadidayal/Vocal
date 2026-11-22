import express from "express";
import { User } from "../models/user.js";
import { Task } from "../models/task.js";
import { sendReminderEmail } from "../services/email-provider.js";

export const reminderDispatchRouter = express.Router();

reminderDispatchRouter.get("/", async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;
    if (!secret || req.get("authorization") !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
    const now = new Date();
    const due = await Task.find({ reminderAt: { $lte: now }, reminderSentAt: null, reminderAttemptedAt: null, deletedAt: null, status: { $in: ["PENDING", "IN_PROGRESS"] } }).sort({ reminderAt: 1 }).limit(30);
    let sent = 0;
    let failed = 0;
    for (const candidate of due) {
      const claim = await Task.findOneAndUpdate(
        { _id: candidate._id, reminderAt: candidate.reminderAt, reminderSentAt: null, reminderAttemptedAt: null, deletedAt: null, status: { $in: ["PENDING", "IN_PROGRESS"] } },
        { $set: { reminderAttemptedAt: now } },
        { new: true },
      );
      if (!claim) continue;
      try {
        const user = await User.findOne({ _id: claim.userId, deletedAt: null }).select("email preferredName timezone");
        if (!user?.email) throw new Error("Reminder recipient is unavailable.");
        await sendReminderEmail({ to: user.email, taskTitle: claim.title, scheduledAt: claim.reminderAt, timezone: claim.dueTimezone || user.timezone });
        await Task.updateOne({ _id: claim._id, reminderAttemptedAt: now, reminderSentAt: null }, { $set: { reminderSentAt: new Date() } });
        sent += 1;
      } catch {
        // Keep a permanent attempt marker to prevent duplicate emails; operator can inspect/retry explicitly.
        failed += 1;
      }
    }
    return res.json({ sent, failed });
  } catch (error) { return next(error); }
});
