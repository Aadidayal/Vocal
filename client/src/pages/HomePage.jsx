import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, CalendarDays, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Command, Filter, LayoutDashboard, ListTodo, LogOut, Plus, Search, Sparkles, SquarePen, X } from "lucide-react";
import { apiGet, apiMutation } from "../api/client.js";
import { useAuth } from "../app/AuthProvider.jsx";
import { TaskDialog } from "../components/TaskDialog.jsx";
import { VoiceAssistant } from "../components/VoiceAssistant.jsx";

const STATUS_FILTERS = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

async function fetchTasks() {
  const tasks = [];
  let cursor;
  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({ limit: "100", sort: "updatedAt:desc" });
    if (cursor) params.set("cursor", cursor);
    const response = await apiGet(`/tasks?${params.toString()}`);
    tasks.push(...response.items);
    if (!response.page?.hasMore || !response.page.nextCursor) break;
    cursor = response.page.nextCursor;
  }
  return tasks;
}

export function HomePage() {
  const { user, isLoading, error, refetch, login, register, logout, authPending } = useAuth();
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({ email: "", password: "", preferredName: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });

  if (isLoading) return <LoadingScreen label="Restoring your secure session…" />;
  if (error) return <ConnectionScreen error={error} onRetry={refetch} />;
  if (!user) {
    async function submitAuth(event) {
      event.preventDefault();
      setAuthError("");
      try {
        if (authMode === "register") {
          await register(authForm);
        } else {
          await login({ email: authForm.email, password: authForm.password });
        }
      } catch (requestError) {
        setAuthError(requestError.message);
      }
    }

    return (
      <main className="min-h-screen bg-[#f5f6fb] text-slate-900">
        <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.04fr_0.96fr]">
          <section className="relative hidden overflow-hidden bg-[#171b3d] px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
            <div aria-hidden="true" className="absolute -right-24 top-20 size-[28rem] rounded-full border border-white/10" />
            <div aria-hidden="true" className="absolute -right-5 top-44 size-[20rem] rounded-full border border-white/10" />
            <div aria-hidden="true" className="absolute -bottom-40 -left-32 size-[30rem] rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-indigo-400 text-white"><Command size={21} /></span><span className="font-bold tracking-tight">AI Task Manager</span></div>
            <div className="relative max-w-xl py-12">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold tracking-wide text-indigo-100"><Sparkles size={14} /> A little more clarity, every day</p>
              <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-6xl">Your plans, with room to <span className="text-indigo-300">breathe.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-indigo-100/75">Keep the important things in view. Move through your day with a calmer sense of what comes next.</p>
              <div className="mt-10 flex items-center gap-3 text-sm text-indigo-100/75"><span className="flex size-8 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><Check size={15} /></span>Private, personal task workspace</div>
            </div>
            <p className="relative text-xs text-indigo-100/45">A focused workspace for your next step.</p>
          </section>

          <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
            <div className="w-full max-w-md">
              <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="flex size-10 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Command size={19} /></span><span className="font-bold">AI Task Manager</span></div>
              <p className="text-sm font-bold text-indigo-600">{authMode === "login" ? "WELCOME BACK" : "GET STARTED"}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{authMode === "login" ? "Sign in to your space" : "Create your account"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{authMode === "login" ? "Your tasks are right where you left them." : "A clear place to start organizing your day."}</p>

              <form className="mt-8 space-y-5" onSubmit={submitAuth}>
                {authMode === "register" && <>
                  <label className="block text-sm font-semibold text-slate-700">Your name
                    <input autoComplete="name" className={inputClass} maxLength={80} onChange={(event) => setAuthForm({ ...authForm, preferredName: event.target.value })} required value={authForm.preferredName} />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">Your timezone
                    <input autoComplete="off" className={inputClass} onChange={(event) => setAuthForm({ ...authForm, timezone: event.target.value })} required value={authForm.timezone} />
                    <span className="mt-1 block text-xs font-normal text-slate-500">Detected from this device. You can edit it.</span>
                  </label>
                </>}
                <label className="block text-sm font-semibold text-slate-700">Email address
                  <input autoComplete="email" className={inputClass} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required type="email" value={authForm.email} />
                </label>
                <label className="block text-sm font-semibold text-slate-700">Password
                  <input autoComplete={authMode === "login" ? "current-password" : "new-password"} className={inputClass} minLength={authMode === "register" ? 12 : undefined} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required type="password" value={authForm.password} />
                  {authMode === "register" && <span className="mt-1 block text-xs font-normal text-slate-500">Use at least 12 characters.</span>}
                </label>
                {authError && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">{authError}</p>}
                <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60" disabled={authPending} type="submit">{authPending ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button>
              </form>
              <p className="mt-6 text-center text-sm text-slate-500">{authMode === "login" ? "New to AI Task Manager?" : "Already have an account?"}{" "}
                <button className="font-bold text-indigo-700 hover:text-indigo-900" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }} type="button">{authMode === "login" ? "Create an account" : "Sign in"}</button>
              </p>
              <p className="mt-8 text-center text-xs leading-5 text-slate-400">Your session is protected with an HTTP-only cookie. Sign-in tokens are never stored in browser storage.</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return <Dashboard user={user} logout={logout} authPending={authPending} />;
}

function Dashboard({ user, logout, authPending }) {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks, retry: false });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialog, setDialog] = useState({ open: false, task: null });
  const [assistantTaskIds, setAssistantTaskIds] = useState(null);
  const [notice, setNotice] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const tasks = tasksQuery.data || [];

  const onCommandResult = useCallback((result) => {
    if (["LIST_TASKS", "SEARCH_TASKS"].includes(result.intent)) {
      setSearch("");
      setStatusFilter("ALL");
      setAssistantTaskIds((result.taskResults || []).map(({ task }) => task.id));
      return;
    }
    if (result.taskResults?.length) {
      setAssistantTaskIds(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async ({ values, task }) => {
      if (!task) {
        const body = { title: values.title, description: values.description, priority: values.priority };
        if (values.due) body.due = values.due;
        return apiMutation("/tasks", "POST", body);
      }
      return apiMutation(`/tasks/${task.id}`, "PATCH", { title: values.title, description: values.description, priority: values.priority, due: values.due, version: task.version });
    },
    onSuccess: (_result, variables) => {
      setDialog({ open: false, task: null });
      setNotice(variables.task ? "Your changes are saved." : "Task added to your list.");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ task, action }) => apiMutation(`/tasks/${task.id}/${action}`, "POST", { version: task.version }),
    onSuccess: (_result, variables) => {
      setNotice(variables.action === "complete" ? "Nice work. Task completed." : "Task reopened.");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const matchesStatus = statusFilter === "ALL" || task.status === statusFilter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || `${task.title} ${task.description || ""}`.toLowerCase().includes(term);
    const matchesAssistant = assistantTaskIds === null || assistantTaskIds.includes(task.id);
    return matchesStatus && matchesSearch && matchesAssistant;
  }), [tasks, search, statusFilter, assistantTaskIds]);

  const counts = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "PENDING").length,
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
  }), [tasks]);

  async function saveTask(values, task) {
    saveMutation.reset();
    await saveMutation.mutateAsync({ values, task });
  }

  async function signOut() {
    setLogoutError("");
    try { await logout(); } catch (error) { setLogoutError(error.message); }
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900 md:flex">
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-slate-200/80 bg-white px-5 py-6 md:flex">
        <Brand />
        <p className="mb-3 mt-11 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
        <nav aria-label="Main navigation" className="space-y-1">
          <a className="flex items-center gap-3 rounded-xl bg-indigo-50 px-3.5 py-3 text-sm font-bold text-indigo-700" href="#tasks"><LayoutDashboard size={18} /> My day</a>
          <a className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" href="#tasks"><ListTodo size={18} /> All tasks <span className="ml-auto rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{counts.total}</span></a>
        </nav>
        <div className="mt-auto rounded-2xl bg-[#f7f7ff] p-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><Sparkles size={17} /></span>
          <p className="mt-3 text-sm font-bold text-slate-800">One thing at a time</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">A calmer view of what matters today.</p>
        </div>
        <UserProfile user={user} onLogout={signOut} pending={authPending} />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-lg sm:px-8 md:hidden">
          <Brand compact />
          <button aria-label="Sign out" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" disabled={authPending} onClick={signOut}><LogOut size={18} /></button>
          <nav aria-label="Main navigation" className="flex basis-full gap-2 border-t border-slate-100 pt-2">
            <a className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700" href="#dashboard-main"><LayoutDashboard size={15} /> My day</a>
            <a className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50" href="#tasks"><ListTodo size={15} /> All tasks</a>
          </nav>
        </header>
        <a className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-slate-900 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4" href="#dashboard-main">Skip to main content</a>
        <main className="mx-auto max-w-6xl px-4 pb-12 pt-7 sm:px-8 sm:pt-10 lg:px-12" id="dashboard-main" tabIndex="-1">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600"><CalendarDays size={14} /> {new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-[2.2rem]">Good to see you, {user.preferredName.split(" ")[0]}<span className="text-indigo-600">.</span></h1>
              <p className="mt-2 text-sm text-slate-500">A little progress goes a long way. Here’s your day at a glance.</p>
            </div>
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700" onClick={() => { saveMutation.reset(); setDialog({ open: true, task: null }); }}><Plus size={16} /> Add manually</button>
          </div>

          <VoiceAssistant user={user} onCommandResult={onCommandResult} />

          {notice && <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status"><span className="flex items-center gap-2"><CheckCheck size={17} />{notice}</span><button aria-label="Dismiss message" className="rounded-lg p-1 hover:bg-emerald-100" onClick={() => setNotice("")}><X size={16} /></button></div>}
          {logoutError && <ErrorBanner message={logoutError} />}

          <section aria-label="Task summaries" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <SummaryCard label="Total tasks" value={counts.total} icon={<ListTodo size={18} />} tone="indigo" />
            <SummaryCard label="Pending" value={counts.pending} icon={<Clock3 size={18} />} tone="amber" />
            <SummaryCard label="In progress" value={counts.inProgress} icon={<ArrowDownUp size={18} />} tone="blue" />
            <SummaryCard label="Completed" value={counts.completed} icon={<CheckCheck size={18} />} tone="green" />
          </section>

          <section className="mt-9" id="tasks">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">Your workspace</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Your tasks <span className="ml-1 text-sm font-semibold text-slate-400">{tasks.length}</span></h2></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative block"><span className="sr-only">Search tasks</span><Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:w-56" onChange={(event) => { setSearch(event.target.value); setAssistantTaskIds(null); }} placeholder="Search tasks…" value={search} /></label>
                <label className="relative block"><span className="sr-only">Filter by status</span><Filter aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><select className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 sm:w-44" onChange={(event) => { setStatusFilter(event.target.value); setAssistantTaskIds(null); }} value={statusFilter}>{STATUS_FILTERS.map((status) => <option key={status} value={status}>{status === "ALL" ? "All statuses" : statusLabel(status)}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /></label>
              </div>
            </div>

            {assistantTaskIds !== null && <div className="mt-4 flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800"><span>Showing tasks from your voice request</span><button className="text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-950" onClick={() => setAssistantTaskIds(null)}>Show all tasks</button></div>}

            {lifecycleMutation.error && <ErrorBanner message={lifecycleMutation.error.message} />}
            {tasksQuery.isLoading ? <TaskLoading /> : tasksQuery.error ? <div className="mt-5"><ErrorPanel error={tasksQuery.error} onRetry={() => tasksQuery.refetch()} /></div> : filteredTasks.length ? (
              <div className="mt-5 space-y-3">
                {filteredTasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => { saveMutation.reset(); setDialog({ open: true, task }); }} onLifecycle={(action) => lifecycleMutation.mutate({ task, action })} pending={lifecycleMutation.isPending && lifecycleMutation.variables?.task.id === task.id} />)}
              </div>
            ) : (
              <EmptyTasks hasAny={tasks.length > 0} search={search} onCreate={() => setDialog({ open: true, task: null })} />
            )}
          </section>

          <footer className="mt-12 flex flex-col gap-2 border-t border-slate-200 pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>AI Task Manager · Keep your day in view.</span><span className="flex items-center gap-1.5"><CircleHelp size={13} /> Your tasks are private to your account.</span></footer>
        </main>
      </div>

      <TaskDialog open={dialog.open} task={dialog.task} timeZone={user.timezone} onClose={() => setDialog({ open: false, task: null })} onSave={saveTask} pending={saveMutation.isPending} />
    </div>
  );
}

const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

function Brand({ compact = false }) {
  return <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20"><Command size={19} /></span><span className="font-extrabold tracking-tight text-slate-950">AI Task Manager{!compact && <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">MVP</span>}</span></div>;
}

function UserProfile({ user, onLogout, pending }) {
  return <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-extrabold text-indigo-700">{initials(user.preferredName)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{user.preferredName}</p><p className="truncate text-xs text-slate-400">{user.email}</p></div><button aria-label="Sign out" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" disabled={pending} onClick={onLogout}><LogOut size={17} /></button></div>;
}

function SummaryCard({ label, value, icon, tone }) {
  const colors = { indigo: "bg-indigo-50 text-indigo-600", amber: "bg-amber-50 text-amber-600", blue: "bg-sky-50 text-sky-600", green: "bg-emerald-50 text-emerald-600" };
  return <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_16px_-12px_rgba(15,23,42,0.25)] sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</span><span className={`flex size-8 items-center justify-center rounded-xl ${colors[tone]}`}>{icon}</span></div><p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">{value}</p></article>;
}

function TaskRow({ task, onEdit, onLifecycle, pending }) {
  const completed = task.status === "COMPLETED";
  const canComplete = !completed && task.status !== "CANCELLED";
  return <article className={`group relative flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_16px_-12px_rgba(15,23,42,0.25)] transition hover:border-indigo-200 sm:flex-row sm:items-center sm:p-5 ${completed ? "opacity-75" : ""}`}>
    <button aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`} className={`flex size-9 shrink-0 items-center justify-center self-start rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:self-center ${completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-indigo-500 hover:bg-indigo-50"}`} disabled={pending || (!completed && !canComplete)} onClick={() => onLifecycle(completed ? "reopen" : "complete")}>
      {completed ? <Check size={17} strokeWidth={3} /> : <span className="size-2 rounded-full bg-indigo-500 opacity-0 group-hover:opacity-100" />}
    </button>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><h3 className={`text-sm font-bold text-slate-900 sm:text-[15px] ${completed ? "line-through decoration-slate-400" : ""}`}>{task.title}</h3><StatusBadge status={task.status} /></div>
      {task.description && <p className="mt-1.5 line-clamp-2 max-w-3xl text-sm leading-5 text-slate-500">{task.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"><PriorityBadge priority={task.priority} />{task.due && <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${task.isOverdue ? "text-rose-600" : "text-slate-500"}`}><CalendarDays size={13} />{formatDue(task.due)}{task.isOverdue ? " · Overdue" : ""}</span>}{task.activeReminder && <span className="text-xs font-medium text-indigo-600">Email reminder {new Date(task.activeReminder.scheduledAt).toLocaleString()}</span>}</div>
    </div>
    <button aria-label={`Edit ${task.title}`} className="absolute right-5 top-5 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:static sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" onClick={onEdit}><SquarePen size={17} /></button>
  </article>;
}

function StatusBadge({ status }) {
  const styles = { PENDING: "bg-amber-50 text-amber-700", IN_PROGRESS: "bg-sky-50 text-sky-700", COMPLETED: "bg-emerald-50 text-emerald-700", CANCELLED: "bg-slate-100 text-slate-600" };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${styles[status]}`}>{statusLabel(status)}</span>;
}

function PriorityBadge({ priority }) {
  const styles = { LOW: "text-slate-500", MEDIUM: "text-indigo-600", HIGH: "text-orange-600", URGENT: "text-rose-600" };
  return <span className={`text-[11px] font-bold uppercase tracking-wide ${styles[priority]}`}>{priority[0] + priority.slice(1).toLowerCase()} priority</span>;
}

function EmptyTasks({ hasAny, search, onCreate }) {
  return <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><ListTodo size={25} /></span><h3 className="mt-4 text-base font-bold text-slate-900">{hasAny ? "No tasks match your search" : "A fresh start"}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{hasAny ? "Try a different phrase or choose another status." : "Add your first task and give your day a little direction."}</p>{!hasAny && <button className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700" onClick={onCreate}><Plus size={16} /> Create your first task</button>}</div>;
}

function TaskLoading() {
  return <div aria-label="Loading tasks" className="mt-5 space-y-3" role="status">{[1, 2, 3].map((row) => <div className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-white" key={row} />)}</div>;
}

function LoadingScreen({ label }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-5"><div className="text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Command size={22} /></span><p className="mt-4 text-sm font-semibold text-slate-600" role="status">{label}</p></div></main>;
}

function ConnectionScreen({ error, onRetry }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-5"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><CircleHelp size={22} /></span><h1 className="mt-4 text-xl font-bold text-slate-900">Can’t connect right now</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error.message}</p><button className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700" onClick={() => onRetry()}>Try again</button></div></main>;
}

function ErrorPanel({ error, onRetry }) {
  return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5"><p className="text-sm font-bold text-rose-800">Tasks couldn’t be loaded</p><p className="mt-1 text-sm text-rose-700">{error.message}</p><button className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-bold text-rose-800 shadow-sm" onClick={() => onRetry()}>Retry</button></div>;
}

function ErrorBanner({ message }) {
  return <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">{message}</p>;
}

function statusLabel(status) { return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatDue(due) {
  if (due.precision === "DATE") {
    const [year, month, day] = due.date.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: due.timezone }).format(new Date(due.at));
}
