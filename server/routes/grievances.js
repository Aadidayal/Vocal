import { randomBytes } from "node:crypto";
import express from "express";
import { z } from "zod";
import { requireAuthenticatedSession } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { Grievance, GRIEVANCE_CATEGORIES, GRIEVANCE_PRIORITIES, GRIEVANCE_STATUSES } from "../models/grievance.js";
import { interpretGrievance } from "../services/grievance-ai.js";

export const grievancesRouter = express.Router();
grievancesRouter.use(requireAuthenticatedSession());
const submitSchema = z.object({ text: z.string().trim().min(8).max(5000), mode: z.enum(["text", "voice_transcript"]) }).strict();
const statusSchema = z.object({ status: z.enum(GRIEVANCE_STATUSES), resolutionNotes: z.string().max(4000).optional(), version: z.number().int().positive() }).strict();

grievancesRouter.post("/", async (req, res, next) => {
  try {
    const inputResult = submitSchema.safeParse(req.body);
    if (!inputResult.success) return next(validationError(inputResult.error));
    const input = inputResult.data;
    const interpreted = await interpretGrievance(input.text);
    const validated = grievanceDataSchema.safeParse(interpreted);
    if (!validated.success) return res.status(200).json({ data: { needsClarification: true, question: "I need a little more detail before creating a ticket. Please describe the issue and where it happened." } });
    const data = validated.data;
    if (!data.category || !data.location.trim() || !data.priority) return res.status(200).json({ data: { needsClarification: true, question: [!data.category ? "the issue category" : "", !data.location.trim() ? "where it happened" : "", !data.priority ? "how urgent it is" : ""].filter(Boolean).join(", ").replace(/^./, (letter) => letter.toUpperCase()) + "?" } });
    const grievance = await Grievance.create({ ticketId: `GR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`, ownerId: req.user._id, ...data, status: "OPEN", history: [{ status: "OPEN", note: "Ticket submitted", changedBy: req.user._id, changedAt: new Date() }] });
    return res.status(201).json({ data: serialize(grievance), processedBy: data.processedBy });
  } catch (error) { return next(error); }
});

grievancesRouter.get("/", async (req, res, next) => {
  try {
    const filter = { ownerId: req.user._id };
    const queryResult = grievanceFilterSchema.safeParse(req.query);
    if (!queryResult.success) return next(validationError(queryResult.error));
    const query = queryResult.data;
    for (const key of ["status", "category", "priority"]) if (query[key]) filter[key] = query[key];
    if (query.q) filter.$or = [{ ticketId: new RegExp(escapeRegex(query.q), "i") }, { title: new RegExp(escapeRegex(query.q), "i") }, { description: new RegExp(escapeRegex(query.q), "i") }];
    const tickets = await Grievance.find(filter).sort({ createdAt: -1 }).limit(100);
    return res.json({ data: tickets.map(serialize) });
  } catch (error) { return next(error); }
});

grievancesRouter.get("/admin", requireAdmin, async (req, res, next) => {
  try {
    const queryResult = grievanceFilterSchema.safeParse(req.query);
    if (!queryResult.success) return next(validationError(queryResult.error));
    const filter = {};
    for (const key of ["status", "category", "priority"]) if (queryResult.data[key]) filter[key] = queryResult.data[key];
    const [tickets, stats] = await Promise.all([Grievance.find(filter).sort({ createdAt: -1 }).limit(200), Grievance.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])]);
    return res.json({ data: tickets.map(serialize), statistics: stats });
  } catch (error) { return next(error); }
});

grievancesRouter.patch("/:ticketId/status", requireAdmin, async (req, res, next) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return next(validationError(parsed.error));
    const { status, resolutionNotes = "", version } = parsed.data;
    const updated = await Grievance.findOneAndUpdate({ ticketId: req.params.ticketId, version }, { $set: { status, resolutionNotes }, $push: { history: { status, note: resolutionNotes, changedBy: req.user._id, changedAt: new Date() } }, $inc: { version: 1 } }, { new: true, runValidators: true });
    if (!updated) return next(Object.assign(new Error("Ticket was not found or changed."), { statusCode: 409, code: "CONFLICT" }));
    return res.json({ data: serialize(updated) });
  } catch (error) { return next(error); }
});

grievancesRouter.get("/:ticketId", async (req, res, next) => {
  try {
    const filter = { ticketId: req.params.ticketId };
    if (req.user.role !== "ADMIN") filter.ownerId = req.user._id;
    const ticket = await Grievance.findOne(filter);
    if (!ticket) return next(Object.assign(new Error("Ticket not found."), { statusCode: 404, code: "NOT_FOUND" }));
    return res.json({ data: serialize(ticket) });
  } catch (error) { return next(error); }
});

const grievanceDataSchema = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().min(8).max(5000), category: z.union([z.enum(GRIEVANCE_CATEGORIES), z.literal("")]), location: z.string().trim().max(200).default(""), priority: z.union([z.enum(GRIEVANCE_PRIORITIES), z.literal("")]), occurredAt: z.string().datetime().nullable().default(null), processedBy: z.enum(["gemini", "local"]) }).strict();
const grievanceFilterSchema = z.object({ status: z.enum(GRIEVANCE_STATUSES).optional(), category: z.enum(GRIEVANCE_CATEGORIES).optional(), priority: z.enum(GRIEVANCE_PRIORITIES).optional(), q: z.string().trim().max(120).optional() }).strict();
function serialize(ticket) { return { ticketId: ticket.ticketId, title: ticket.title, description: ticket.description, category: ticket.category, location: ticket.location, priority: ticket.priority, occurredAt: ticket.occurredAt, status: ticket.status, resolutionNotes: ticket.resolutionNotes, history: ticket.history, version: ticket.version, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt }; }
function validationError(error) { return Object.assign(new Error("Request validation failed."), { statusCode: 400, code: "VALIDATION_ERROR", details: error.issues.map(i=>({field:i.path.join("."),message:i.message})) }); }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
