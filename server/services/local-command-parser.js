const priorities = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export function parseLocalCommand(text, tasks, timezone = "UTC", now = new Date()) {
  const source = String(text || "").trim();
  const lower = source.toLocaleLowerCase();
  const base = { reply: "", targetTaskId: "", searchQuery: "", task: emptyTask(timezone), updates: [] };
  if (/^(show|list|what are|what's|find|search).*(task|today|to.?do)/i.test(lower)) {
    const searchQuery = /\b(find|search)\b/.test(lower) ? lower.replace(/^(find|search)\s+(my\s+)?tasks?\s*/i, "").trim() : "";
    return { ...base, intent: searchQuery ? "SEARCH_TASKS" : "LIST_TASKS", searchQuery, reply: "I’ll check your tasks." };
  }
  const create = lower.match(/^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:task\s+)?(.+)$/i)
    || lower.match(/^(?:please\s+)?remind me to\s+(.+)$/i);
  if (create) {
    const title = cleanTitle(create[1]);
    if (!title) return clarify("What should I call the task?");
    return { ...base, intent: "CREATE_TASK", task: { ...base.task, title: title[0].toLocaleUpperCase()+title.slice(1), priority: priorities.find(p=>lower.includes(p.toLocaleLowerCase()))||"MEDIUM", duePrecision: "NONE" }, reply: "I’ll add that task." };
  }
  const intent = /\b(reopen|re-open)\b/.test(lower) ? "REOPEN_TASK" : /\b(complete|finish|mark.*done)\b/.test(lower) ? "COMPLETE_TASK" : /\b(update|rename|change)\b/.test(lower) ? "UPDATE_TASK" : null;
  if (!intent) return clarify("I can add, list, search, update, complete, or reopen a task. What would you like me to do?");
  const matches = tasks.filter(task => lower.includes(task.title.toLocaleLowerCase()));
  if (matches.length !== 1) return clarify("Which task do you mean? Please say its full title.");
  if (intent === "UPDATE_TASK") {
    const rename = source.match(/\b(?:to|as)\s+(.+)$/i);
    if (!rename?.[1]) return clarify("What should the new task title be?");
    return { ...base, intent, targetTaskId: matches[0].id, updates: [{ field: "title", value: rename[1].trim() }], reply: "I’ll update that task." };
  }
  if (intent === "REOPEN_TASK" && matches[0].status !== "COMPLETED") return clarify("That task is not completed, so there’s nothing to reopen.");
  return { ...base, intent, targetTaskId: matches[0].id, reply: "I’ll update that task." };
}

function cleanTitle(value) { return value.replace(/\b(?:by|on|tomorrow|today|urgent|high priority|medium priority|low priority)\b.*$/i, "").trim().replace(/[.!?]+$/, ""); }
function emptyTask(timezone) { return { title:"", description:"", priority:"MEDIUM", duePrecision:"NONE", dueDate:"", dueAt:"", dueTimezone:timezone }; }
function clarify(reply) { return { intent:"CLARIFICATION", reply, targetTaskId:"", searchQuery:"", task:emptyTask("UTC"), updates:[] }; }
