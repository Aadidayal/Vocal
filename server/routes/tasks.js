import express from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuthenticatedSession } from "../middleware/authenticate.js";
import { Task, TASK_PRIORITIES, TASK_STATUSES } from "../models/task.js";

export const tasksRouter = express.Router();
const authenticate = requireAuthenticatedSession();

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "Must be a valid calendar date");
const timezone = z.string().trim().min(1).refine(isIanaTimezone, "Must be a valid IANA timezone");
const dueSchema = z.discriminatedUnion("precision", [
  z.object({ precision: z.literal("DATE"), date: dateString, timezone }).strict(),
  z.object({ precision: z.literal("DATETIME"), at: z.string().datetime({ offset: true }).refine((v) => v.endsWith("Z"), "Must be a UTC instant"), timezone }).strict(),
]);
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  due: dueSchema.optional(),
}).strict();
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  due: dueSchema.nullable().optional(),
  version: z.number().int().min(1),
}).strict().refine((body) => Object.keys(body).some((key) => key !== "version"), "At least one task field must change");
const transitionSchema = z.object({ version: z.number().int().min(1) }).strict();

tasksRouter.use(authenticate);

tasksRouter.get("/", asyncRoute(async (req, res) => {
  const querySchema = z.object({
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
    sort: z.enum(["updatedAt:asc", "updatedAt:desc", "createdAt:asc", "createdAt:desc"]).default("updatedAt:desc"),
  }).strict();
  const query = parse(querySchema, req.query);
  const filter = { userId: req.user._id, deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  const { field, direction } = parseSort(query.sort);
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    const comparison = direction === 1 ? "$gt" : "$lt";
    filter.$or = [
      { [field]: { [comparison]: cursor.value } },
      { [field]: cursor.value, _id: { [comparison]: cursor.id } },
    ];
  }
  const documents = await Task.find(filter)
    .sort({ [field]: direction, _id: direction })
    .limit(query.limit + 1);
  const hasMore = documents.length > query.limit;
  const items = documents.slice(0, query.limit);
  const last = items.at(-1);
  res.json({
    items: items.map((task) => serializeTask(task)),
    page: { nextCursor: hasMore && last ? encodeCursor(last, field) : null, hasMore },
  });
}));

tasksRouter.post("/", asyncRoute(async (req, res) => {
  const body = parse(createSchema, req.body);
  const task = await Task.create({
    userId: req.user._id,
    title: body.title,
    description: body.description ?? "",
    priority: body.priority ?? "MEDIUM",
    status: body.status ?? "PENDING",
    ...dueFields(body.due),
  });
  res.status(201).json({ task: serializeTask(task) });
}));

tasksRouter.get("/:taskId", asyncRoute(async (req, res) => {
  const taskId = parseId(req.params.taskId);
  const task = await Task.findOne({ _id: taskId, userId: req.user._id, deletedAt: null });
  if (!task) throw notFound();
  res.json({ task: serializeTask(task) });
}));

tasksRouter.patch("/:taskId", asyncRoute(async (req, res) => {
  const taskId = parseId(req.params.taskId);
  const body = parse(patchSchema, req.body);
  const { version, due, ...changes } = body;
  if (due !== undefined) {
    const current = await Task.findOne({ _id: taskId, userId: req.user._id, deletedAt: null });
    if (!current) throw notFound();
    if (current.version !== version) await throwMissingOrConflict(taskId, req.user._id);
    if (current.duePrecision && due && current.duePrecision !== due.precision) {
      throw Object.assign(new Error("Task due precision cannot be changed."), { statusCode: 400, code: "VALIDATION_ERROR" });
    }
    Object.assign(changes, dueFields(due ?? undefined));
    changes.reminderAt = null;
    changes.reminderSentAt = null;
    changes.reminderAttemptedAt = null;
  }
  const task = await Task.findOneAndUpdate(
    { _id: taskId, userId: req.user._id, deletedAt: null, version },
    { $set: changes, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!task) await throwMissingOrConflict(taskId, req.user._id);
  res.json({ task: serializeTask(task) });
}));

tasksRouter.post("/:taskId/complete", asyncRoute(async (req, res) => {
  const taskId = parseId(req.params.taskId);
  const { version } = parse(transitionSchema, req.body);
  const current = await Task.findOne({ _id: taskId, userId: req.user._id, deletedAt: null });
  if (!current) throw notFound();
  if (current.status === "COMPLETED") return res.json({ task: serializeTask(current) });
  if (current.status === "CANCELLED") {
    throw Object.assign(new Error("A cancelled task cannot be completed."), { statusCode: 409, code: "CONFLICT" });
  }
  if (current.version !== version) await throwMissingOrConflict(taskId, req.user._id);
  const task = await Task.findOneAndUpdate(
    { _id: taskId, userId: req.user._id, deletedAt: null, version },
    { $set: { status: "COMPLETED", completedAt: new Date() }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!task) await throwMissingOrConflict(taskId, req.user._id);
  res.json({ task: serializeTask(task) });
}));

tasksRouter.post("/:taskId/reopen", asyncRoute(async (req, res) => {
  const taskId = parseId(req.params.taskId);
  const { version } = parse(transitionSchema, req.body);
  const current = await Task.findOne({ _id: taskId, userId: req.user._id, deletedAt: null });
  if (!current) throw notFound();
  if (current.status !== "COMPLETED") {
    throw Object.assign(new Error("Only a completed task can be reopened."), { statusCode: 409, code: "CONFLICT" });
  }
  if (current.version !== version) await throwMissingOrConflict(taskId, req.user._id);
  const task = await Task.findOneAndUpdate(
    { _id: taskId, userId: req.user._id, deletedAt: null, version },
    { $set: { status: "PENDING", completedAt: null }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!task) await throwMissingOrConflict(taskId, req.user._id);
  res.json({ task: serializeTask(task) });
}));

function dueFields(due) {
  if (!due) return { duePrecision: null, dueDate: null, dueAt: null, dueTimezone: null };
  if (due.precision === "DATE") return { duePrecision: "DATE", dueDate: due.date, dueAt: null, dueTimezone: due.timezone };
  return { duePrecision: "DATETIME", dueDate: null, dueAt: new Date(due.at), dueTimezone: due.timezone };
}

export function serializeTask(task, now = new Date()) {
  const due = task.duePrecision === "DATE"
    ? { precision: "DATE", date: task.dueDate, timezone: task.dueTimezone }
    : task.duePrecision === "DATETIME"
      ? { precision: "DATETIME", at: new Date(task.dueAt).toISOString(), timezone: task.dueTimezone }
      : null;
  const eligible = !task.deletedAt && !["COMPLETED", "CANCELLED"].includes(task.status);
  const overdue = eligible && (task.duePrecision === "DATETIME"
    ? new Date(task.dueAt).getTime() < now.getTime()
    : task.duePrecision === "DATE" && localDate(now, task.dueTimezone) > task.dueDate);
  return {
    id: String(task._id),
    title: task.title,
    description: task.description || null,
    priority: task.priority,
    status: task.status,
    ...(due ? { due } : {}),
    activeReminder: task.reminderAt && !task.reminderSentAt ? { scheduledAt: new Date(task.reminderAt).toISOString() } : null,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    isOverdue: Boolean(overdue),
    version: task.version,
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
  };
}

function localDate(date, zone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function parseSort(value) {
  const [field, order] = value.split(":");
  return { field, direction: order === "asc" ? 1 : -1 };
}
function encodeCursor(task, field) {
  return Buffer.from(JSON.stringify({ value: new Date(task[field]).toISOString(), id: String(task._id) })).toString("base64url");
}
function decodeCursor(value) {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded || !Number.isFinite(Date.parse(decoded.value)) || !mongoose.isValidObjectId(decoded.id)) throw new Error();
    return { value: new Date(decoded.value), id: decoded.id };
  } catch {
    throw Object.assign(new Error("Pagination cursor is invalid."), { statusCode: 400, code: "VALIDATION_ERROR", details: [{ field: "cursor", message: "Must be a valid opaque task cursor." }] });
  }
}
function isRealDate(value) { const date = new Date(`${value}T00:00:00.000Z`); return date.toISOString().slice(0, 10) === value; }
function isIanaTimezone(value) { try { return Boolean(Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone); } catch { return false; } }
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const error = new Error("Request validation failed.");
  error.statusCode = 400;
  error.code = "VALIDATION_ERROR";
  error.details = result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }));
  throw error;
}
function parseId(value) { if (mongoose.isValidObjectId(value)) return value; throw Object.assign(new Error("Task identifier is invalid."), { statusCode: 400, code: "VALIDATION_ERROR" }); }
function asyncRoute(handler) { return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next); }
function notFound() { return Object.assign(new Error("The requested task was not found."), { statusCode: 404, code: "NOT_FOUND" }); }
async function throwMissingOrConflict(taskId, userId) {
  const existing = await Task.exists({ _id: taskId, userId, deletedAt: null });
  if (!existing) throw notFound();
  throw Object.assign(new Error("The task was changed by another request."), { statusCode: 409, code: "VERSION_CONFLICT" });
}
