import { describe, expect, it } from "vitest";
import { extractTaskFilters, parseLocalCommand } from "../services/local-command-parser.js";

describe("local command fallback", () => {
  it("asks for a deadline when reminder wording has no date or time", () => {
    const result = parseLocalCommand("remind me to have lunch after breakfast", [], "Asia/Kolkata");
    expect(result).toMatchObject({ intent: "CLARIFICATION" });
    expect(result.reply).toMatch(/date and time/i);
  });

  it("parses an explicit reminder time in the user's timezone", () => {
    const result = parseLocalCommand("remind me to submit the form tomorrow at 6 pm", [], "Asia/Kolkata", new Date("2026-11-22T04:00:00.000Z"));
    expect(result).toMatchObject({ intent: "CREATE_TASK", task: { title: "Submit the form", duePrecision: "DATETIME", reminderRequested: true, reminderLeadMinutes: 0 } });
    expect(new Date(result.task.dueAt).toISOString()).toBe("2026-11-23T12:30:00.000Z");
  });

  it.each([
    ["show me pending tasks", "PENDING", ""],
    ["show completed tasks", "COMPLETED", ""],
    ["list tasks with low priority", "", "LOW"],
    ["show high priority tasks that are in progress", "IN_PROGRESS", "HIGH"],
  ])("extracts status and priority filters from %s", (text, status, priority) => {
    const result = parseLocalCommand(text, []);
    expect(result).toMatchObject({ intent: "LIST_TASKS", filters: { status, priority }, searchQuery: "" });
  });

  it("recognizes explicit filter wording even if Gemini omits filter fields", () => {
    expect(extractTaskFilters("show me task with the status name like pending")).toEqual({ status: "PENDING", priority: "" });
    expect(extractTaskFilters("show me task with most priority low priority")).toEqual({ status: "", priority: "LOW" });
    expect(extractTaskFilters("complete the pending task")).toBeNull();
  });
});
