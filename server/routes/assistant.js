import { randomUUID } from "node:crypto";
import express from "express";
import { z } from "zod";
import { requireAuthenticatedSession } from "../middleware/authenticate.js";
import { Task, TASK_PRIORITIES } from "../models/task.js";
import { interpretTaskCommand } from "../services/gemini-provider.js";
import { parseLocalCommand } from "../services/local-command-parser.js";
import { serializeTask } from "./tasks.js";

export const assistantRouter = express.Router();
assistantRouter.use(requireAuthenticatedSession());

const requestSchema = z.object({
  conversationId: z.string().max(200).optional(),
  text: z.string().trim().min(1).max(2000),
  mode: z.enum(["text", "voice_transcript"]),
}).strict();
const dateDueSchema = z.object({ precision: z.literal("DATE"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "Must be a valid calendar date"), timezone: z.string().min(1).refine(isIanaTimezone, "Must be a valid IANA timezone") }).strict();
const dateTimeDueSchema = z.object({ precision: z.literal("DATETIME"), at: z.string().datetime().refine((value) => value.endsWith("Z")), timezone: z.string().min(1).refine(isIanaTimezone, "Must be a valid IANA timezone") }).strict();
const noDueSchema = z.object({ precision: z.literal("NONE") }).strict();
const dueSchema = z.discriminatedUnion("precision", [noDueSchema, dateDueSchema, dateTimeDueSchema]);

assistantRouter.post("/messages", async (req, res, next) => {
  try {
    const input = parseRequest(req.body);
    const now = new Date();
    const documents = await Task.find({ userId: req.user._id, deletedAt: null })
      .sort({ updatedAt: -1, _id: -1 }).limit(100);
    const taskContext = documents.map((task) => ({
      id: String(task._id),
      title: task.title,
      description: (task.description || "").slice(0, 300),
      priority: task.priority,
      status: task.status,
      due: task.duePrecision === "DATE"
        ? { precision: "DATE", date: task.dueDate, timezone: task.dueTimezone }
        : task.duePrecision === "DATETIME"
          ? { precision: "DATETIME", at: task.dueAt.toISOString(), timezone: task.dueTimezone }
          : null,
    }));
    let command;
    let processedBy = "gemini";
    try {
      command = await interpretTaskCommand({ text: input.text, timezone: req.user.timezone, now, tasks: taskContext });
    } catch (error) {
      if (!String(error.code || "").startsWith("AI_")) throw error;
      command = parseLocalCommand(input.text, taskContext, req.user.timezone, now);
      processedBy = "local";
    }
    const outcome = await executeCommand(command, { user: req.user, taskContext, taskDocuments: documents, now });

    return res.status(200).json({
      message: { id: `msg_${randomUUID()}`, role: "USER", content: input.text, mode: input.mode.toUpperCase() },
      reply: outcome.reply,
      intent: outcome.intent,
      processedBy,
      ...(outcome.taskResults ? { taskResults: outcome.taskResults } : {}),
      ...(outcome.confirmation ? { confirmation: outcome.confirmation } : {}),
    });
  } catch (error) {
    return next(error);
  }
});

async function executeCommand(command, { user, taskContext, taskDocuments, now }) {
  if (command.intent === "CLARIFICATION" || command.intent === "GENERAL") {
    return { intent: command.intent, reply: command.reply };
  }

  if (command.intent === "CREATE_TASK") {
    if (!command.task.title.trim()) return clarification("What would you like the task to be called?");
    const dueResult = parseDue(command.task);
    if (dueResult.error) return clarification(dueResult.error);
    const task = await Task.create({
      userId: user._id,
      title: command.task.title.trim(),
      description: command.task.description.trim(),
      priority: command.task.priority || "MEDIUM",
      status: "PENDING",
      ...dueResult.fields,
    });
    return { intent: "CREATE_TASK", reply: `Added “${task.title}” to your tasks.`, taskResults: [{ operation: "CREATED", task: serializeTask(task, now) }] };
  }

  if (command.intent === "LIST_TASKS" || command.intent === "SEARCH_TASKS") {
    const needle = command.searchQuery.trim().toLocaleLowerCase();
    const matches = taskDocuments.filter((task) => !needle || `${task.title} ${task.description || ""}`.toLocaleLowerCase().includes(needle));
    return {
      intent: command.intent,
      reply: matches.length === 0 ? "I couldn’t find a matching task." : matches.length === 1 ? `I found ${matches[0].title}.` : `I found ${matches.length} matching tasks.`,
      taskResults: matches.slice(0, 10).map((task) => ({ operation: "FOUND", task: serializeTask(task, now) })),
    };
  }

  if (command.intent === "DELETE_TASK") {
    return clarification("I found the task, but deletion needs its explicit confirmation step. Would you like to review it?");
  }

  const targetId = command.targetTaskId;
  if (!targetId || !taskContext.some((task) => task.id === targetId)) {
    return clarification("Which task do you mean? Please name it a little more specifically.");
  }
  const task = await Task.findOne({ _id: targetId, userId: user._id, deletedAt: null });
  if (!task) return clarification("I can’t find that task anymore. Which one should I use?");

  if (command.intent === "COMPLETE_TASK" || command.intent === "REOPEN_TASK") {
    const completing = command.intent === "COMPLETE_TASK";
    const desiredStatus = completing ? "COMPLETED" : "PENDING";
    if (completing && task.status === "CANCELLED") return clarification("That task is cancelled, so I can’t complete it. Would you like to review it?");
    if (!completing && task.status !== "COMPLETED") return clarification("That task isn’t completed, so there’s nothing to reopen.");
    if (completing && task.status === "COMPLETED") return { intent: command.intent, reply: `“${task.title}” is already complete.`, taskResults: [{ operation: "UNCHANGED", task: serializeTask(task, now) }] };
    const updated = await Task.findOneAndUpdate(
      { _id: task._id, userId: user._id, deletedAt: null, version: task.version },
      { $set: { status: desiredStatus, completedAt: completing ? now : null }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) return clarification("That task changed just now. Please try again.");
    const reply = completing ? `Marked “${updated.title}” complete.` : `Reopened “${updated.title}”.`;
    return { intent: command.intent, reply, taskResults: [{ operation: completing ? "COMPLETED" : "REOPENED", task: serializeTask(updated, now) }] };
  }

  if (command.intent === "UPDATE_TASK") {
    const changes = {};
    for (const update of command.updates) {
      if (update.field === "title") {
        if (!update.value.trim() || update.value.length > 200) return clarification("What should the updated task title be?");
        changes.title = update.value.trim();
      }
      if (update.field === "description") changes.description = update.value.slice(0, 5000);
      if (update.field === "priority") {
        if (!TASK_PRIORITIES.includes(update.value)) return clarification("Which priority should I use: low, medium, high, or urgent?");
        changes.priority = update.value;
      }
      if (update.field === "due") {
        let requestedDue;
        try { requestedDue = dueSchema.parse(JSON.parse(update.value)); } catch { return clarification("Please tell me the new due date or time more clearly."); }
        if (requestedDue.precision !== "NONE" && task.duePrecision && task.duePrecision !== requestedDue.precision) return clarification("This task’s date-only or date-and-time type can’t be changed. I can keep the same type or clear its deadline.");
        Object.assign(changes, requestedDue.precision === "NONE"
          ? { duePrecision: null, dueDate: null, dueAt: null, dueTimezone: null }
          : requestedDue.precision === "DATE"
            ? { duePrecision: "DATE", dueDate: requestedDue.date, dueAt: null, dueTimezone: requestedDue.timezone }
            : { duePrecision: "DATETIME", dueDate: null, dueAt: new Date(requestedDue.at), dueTimezone: requestedDue.timezone });
      }
    }
    if (Object.keys(changes).length === 0) return clarification("What would you like me to change on that task?");
    const updated = await Task.findOneAndUpdate(
      { _id: task._id, userId: user._id, deletedAt: null, version: task.version },
      { $set: changes, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) return clarification("That task changed just now. Please try again.");
    return { intent: "UPDATE_TASK", reply: `Updated “${updated.title}”.`, taskResults: [{ operation: "UPDATED", task: serializeTask(updated, now) }] };
  }

  return clarification("I can help add, find, update, complete, or reopen a task. What would you like me to do?");
}

function parseDue(task) {
  if (task.duePrecision === "NONE") return { fields: { duePrecision: null, dueDate: null, dueAt: null, dueTimezone: null } };
  let due;
  try {
    due = dueSchema.parse(task.duePrecision === "DATE"
      ? { precision: "DATE", date: task.dueDate, timezone: task.dueTimezone }
      : { precision: "DATETIME", at: task.dueAt, timezone: task.dueTimezone });
  } catch { return { error: "I couldn’t confirm that deadline. Please repeat the date or time." }; }
  if (due.precision === "NONE") return { fields: { duePrecision: null, dueDate: null, dueAt: null, dueTimezone: null } };
  if (!isIanaTimezone(due.timezone)) return { error: "Which timezone should I use for that deadline?" };
  if (due.precision === "DATE") {
    const date = new Date(`${due.date}T00:00:00.000Z`);
    if (date.toISOString().slice(0, 10) !== due.date) return { error: "That calendar date doesn’t look valid. What date should I use?" };
    return { fields: { duePrecision: "DATE", dueDate: due.date, dueAt: null, dueTimezone: due.timezone } };
  }
  if (!due.at.endsWith("Z")) return { error: "Please specify the time in your local timezone." };
  return { fields: { duePrecision: "DATETIME", dueDate: null, dueAt: new Date(due.at), dueTimezone: due.timezone } };
}

function clarification(reply) { return { intent: "CLARIFICATION", reply }; }
function isIanaTimezone(value) { try { return Boolean(Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone); } catch { return false; } }
function isRealDate(value) { const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function parseRequest(body) {
  const result = requestSchema.safeParse(body);
  if (result.success) return result.data;
  const error = new Error("Request validation failed.");
  error.statusCode = 400;
  error.code = "VALIDATION_ERROR";
  error.details = result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
  throw error;
}
