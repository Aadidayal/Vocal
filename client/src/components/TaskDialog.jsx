import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { localInputToUtc, utcToLocalInput } from "../api/dateTime.js";

const blankTask = { title: "", description: "", priority: "MEDIUM", precision: "DATE", dueDate: "", dueAt: "", dueTimezone: "" };

export function TaskDialog({ open, task, timeZone, onClose, onSave, pending }) {
  const [form, setForm] = useState(blankTask);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(task ? {
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      precision: task.due?.precision || "DATE",
      dueDate: task.due?.precision === "DATE" ? task.due.date : "",
      dueAt: task.due?.precision === "DATETIME" ? utcToLocalInput(task.due.at, task.due.timezone || timeZone) : "",
      dueTimezone: task.due?.timezone || timeZone,
    } : { ...blankTask, dueTimezone: timeZone });
    setFormError("");
  }, [open, task, timeZone]);

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    let due;
    try {
      if (form.precision === "DATE" && form.dueDate) due = { precision: "DATE", date: form.dueDate, timezone: form.dueTimezone };
      if (form.precision === "DATETIME" && form.dueAt) due = { precision: "DATETIME", at: localInputToUtc(form.dueAt, form.dueTimezone), timezone: form.dueTimezone };
    } catch (error) {
      setFormError(error.message);
      return;
    }
    try {
      await onSave({ title: form.title.trim(), description: form.description, priority: form.priority, due: due || null }, task);
    } catch (error) {
      setFormError(error.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby="task-dialog-title" aria-modal="true" className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl sm:max-w-xl sm:rounded-[1.75rem]" role="dialog">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">{task ? "Task details" : "Make it happen"}</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950" id="task-dialog-title">{task ? "Edit task" : "Create a task"}</h2>
          </div>
          <button aria-label="Close dialog" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600" onClick={onClose} type="button"><X size={19} /></button>
        </div>

        <form className="space-y-5 px-6 py-6 sm:px-8" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-700">Task title <span className="text-rose-500">*</span>
            <input autoFocus className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" maxLength={200} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Prepare the presentation" required value={form.title} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span>
            <textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" maxLength={5000} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add a little more context…" value={form.description} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">Priority
              <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" onChange={(event) => setForm({ ...form, priority: event.target.value })} value={form.priority}>
                <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Due date type
              <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" onChange={(event) => setForm({ ...form, precision: event.target.value })} value={form.precision}>
                <option value="DATE">Date only</option><option value="DATETIME">Date and time</option>
              </select>
            </label>
          </div>
          {form.precision === "DATE" ? (
            <label className="block text-sm font-semibold text-slate-700">Due date <span className="font-normal text-slate-400">(optional · {form.dueTimezone})</span>
              <input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" onChange={(event) => setForm({ ...form, dueDate: event.target.value })} type="date" value={form.dueDate} />
            </label>
          ) : (
            <label className="block text-sm font-semibold text-slate-700">Due date and time <span className="font-normal text-slate-400">(optional · {form.dueTimezone})</span>
              <input className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" onChange={(event) => setForm({ ...form, dueAt: event.target.value })} type="datetime-local" value={form.dueAt} />
            </label>
          )}
          {formError && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">{formError}</p>}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600" onClick={onClose} type="button">Cancel</button>
            <button className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">{pending ? "Saving…" : task ? "Save changes" : "Create task"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
