const priorities = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export function extractTaskFilters(text) {
  const lower = String(text || "").toLocaleLowerCase();
  if (!/\b(show|list|find|search|display|see|view)\b/.test(lower)) return null;
  const statusMatch = /\b(pending|in[ -]progress|completed|complete|cancelled|canceled)\b/i.exec(lower);
  const priorityMatch = /\b(low|medium|high|urgent)\s+(?:task\s+)?priority\b|\bpriority\s+(?:is\s+)?(low|medium|high|urgent)\b/i.exec(lower);
  if (!statusMatch && !priorityMatch) return null;
  const statusName = statusMatch?.[1]?.toLowerCase() || "";
  return {
    status: statusName ? normalizeStatus(statusName) : "",
    priority: (priorityMatch?.[1] || priorityMatch?.[2] || "").toUpperCase(),
  };
}

export function parseLocalCommand(text, tasks, timezone = "UTC", now = new Date()) {
  const source = String(text || "").trim();
  const lower = source.toLocaleLowerCase();
  const base = { reply: "", targetTaskId: "", searchQuery: "", filters: { status: "", priority: "" }, task: emptyTask(timezone), updates: [] };
  if (/^(show|list|what are|what's|find|search).*(task|today|to.?do)/i.test(lower)) {
    const searchQuery = /\b(find|search)\b/.test(lower) ? lower.replace(/^(find|search)\s+(my\s+)?tasks?\s*/i, "").trim() : "";
    const filters = extractTaskFilters(source) || { status: "", priority: "" };
    const hasFilters = Boolean(filters.status || filters.priority);
    return { ...base, intent: searchQuery && !hasFilters ? "SEARCH_TASKS" : "LIST_TASKS", searchQuery: hasFilters ? "" : searchQuery, filters, reply: "I’ll check your tasks." };
  }
  const create = lower.match(/^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:task\s+)?(.+)$/i)
    || lower.match(/^(?:please\s+)?remind me to\s+(.+)$/i);
  if (create) {
    const title = cleanTitle(create[1]);
    if (!title) return clarify("What should I call the task?");
    const task = { ...base.task, title: title[0].toLocaleUpperCase()+title.slice(1), priority: priorities.find(p=>lower.includes(p.toLocaleLowerCase()))||"MEDIUM", duePrecision: "NONE" };
    if (/\b(remind|reminder|notify|notification|email me)\b/i.test(lower)) {
      const due = localDue(source, timezone, now);
      if (!due) return clarify("What date and time should I remind you about?");
      task.duePrecision = due.precision;
      task.dueDate = due.date || "";
      task.dueAt = due.at || "";
      task.reminderRequested = true;
      task.reminderLeadMinutes = 0;
    }
    return { ...base, intent: "CREATE_TASK", task, reply: "I’ll add that task." };
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
function emptyTask(timezone) { return { title:"", description:"", priority:"MEDIUM", duePrecision:"NONE", dueDate:"", dueAt:"", dueTimezone:timezone, reminderRequested:false, reminderLeadMinutes:0 }; }
function clarify(reply) { return { intent:"CLARIFICATION", reply, targetTaskId:"", searchQuery:"", filters:{status:"",priority:""}, task:emptyTask("UTC"), updates:[] }; }
function normalizeStatus(value) { return value === "in progress" || value === "in-progress" ? "IN_PROGRESS" : value === "complete" ? "COMPLETED" : value === "canceled" ? "CANCELLED" : value.toUpperCase(); }

function localDue(source, timezone, now) {
  const explicit = source.match(/\b(?:on|by)\s+(\d{4}-\d{2}-\d{2})\b/i);
  const relative = source.match(/\b(today|tomorrow)\b/i)?.[1]?.toLowerCase();
  const timeMatch = source.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!explicit && !relative && !timeMatch) return null;
  const date = explicit?.[1] || dateInZone(new Date(now.getTime() + (relative === "tomorrow" ? 86400000 : 0)), timezone);
  const hourRaw = timeMatch ? Number(timeMatch[1]) : 9;
  const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;
  if (hourRaw > 12 || hourRaw < 1 || minute > 59) return null;
  let hour = hourRaw % 12;
  if (timeMatch?.[3]?.toLowerCase() === "pm") hour += 12;
  const at = localWallTimeToUtc(`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`, timezone);
  return at ? { precision:"DATETIME", at:at.toISOString() } : null;
}
function dateInZone(date, zone) { const parts = new Intl.DateTimeFormat("en-CA", {timeZone:zone, year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date); const values = Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${values.year}-${values.month}-${values.day}`; }
function localWallTimeToUtc(local, zone) { const target = Date.parse(`${local}:00Z`); let candidate=target; for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(candidate)); const v=Object.fromEntries(parts.map(x=>[x.type,x.value])); const seen=Date.parse(`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:00Z`); candidate+=target-seen;} return dateInZone(new Date(candidate),zone)===local.slice(0,10)?new Date(candidate):null; }
