import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Circle, Mic, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";

const seed = [
  { id:"d1", title:"Polish the launch presentation", priority:"HIGH", status:"IN_PROGRESS" },
  { id:"d2", title:"Send the project update", priority:"MEDIUM", status:"PENDING" },
  { id:"d3", title:"Review this week’s priorities", priority:"LOW", status:"COMPLETED" },
];
const examples=["Add a high priority task to prepare the demo tomorrow","Show my tasks","Mark the project update complete","Reopen the project update"];

function workspaceId(){let id=sessionStorage.getItem("daymark-demo-id");if(!id){id=crypto.randomUUID();sessionStorage.setItem("daymark-demo-id",id)}return id}
function storageKey(){return `daymark-demo:${workspaceId()}`}

export function DemoPage(){
  const [tasks,setTasks]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey()))||seed}catch{return seed}});
  const [command,setCommand]=useState("");const [reply,setReply]=useState("This is your private demo workspace. Try a command or manage tasks below.");const [engine,setEngine]=useState("Local demo mode");
  const counts=useMemo(()=>({total:tasks.length,pending:tasks.filter(t=>t.status==="PENDING").length,progress:tasks.filter(t=>t.status==="IN_PROGRESS").length,done:tasks.filter(t=>t.status==="COMPLETED").length}),[tasks]);
  function commit(next){setTasks(next);sessionStorage.setItem(storageKey(),JSON.stringify(next))}
  function handleCommand(text){const parsed=parseCommand(text,tasks);if(!parsed){setReply("I’m not sure which task you mean. Try a more specific command or use the task controls below.");setEngine("Local fallback · needs clarification");return}if(parsed.action==="CREATE_TASK"){const task={id:crypto.randomUUID(),title:parsed.title,priority:parsed.priority,status:"PENDING"};commit([task,...tasks]);setReply(`Added “${task.title}” to your demo tasks.`)}else if(parsed.action==="LIST_TASKS"||parsed.action==="SEARCH_TASKS"){setReply(tasks.length?`You have ${tasks.length} demo tasks. They’re shown below.`:"Your demo task list is empty.")}else{const index=tasks.findIndex(t=>parsed.target&&t.title.toLowerCase().includes(parsed.target));if(index<0){setReply("I couldn’t identify that demo task. Try its title or use the controls.");setEngine("Local fallback · needs clarification");return}const next=[...tasks];const task={...next[index]};if(parsed.action==="COMPLETE_TASK")task.status="COMPLETED";if(parsed.action==="REOPEN_TASK")task.status="PENDING";if(parsed.action==="UPDATE_TASK")task.title=parsed.title;next[index]=task;commit(next);setReply(parsed.action==="UPDATE_TASK"?`Updated “${task.title}”.`:`${parsed.action==="COMPLETE_TASK"?"Completed":"Reopened"} “${task.title}”.`)}setEngine("Local demo mode · no Gemini request");setCommand(text);}
  function submit(e){e.preventDefault();if(command.trim())handleCommand(command.trim())}
  return <main className="min-h-screen bg-[#f6f7fb] px-4 py-5 text-slate-900 sm:px-8"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between"><Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft size={17}/> Back to overview</Link><Link to="/login" className="text-sm font-bold text-indigo-700">Login</Link></header><div className="mt-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Interactive preview</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Your demo workspace</h1><p className="mt-2 text-sm text-slate-500">Isolated to this browser tab. Demo edits never touch registered accounts.</p></div><button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold" onClick={()=>commit(seed)}>Reset demo</button></div>
    <section className="mt-6 rounded-3xl bg-gradient-to-br from-[#202653] to-[#5558bb] p-5 text-white shadow-xl sm:p-8"><div className="flex flex-col items-center gap-5 sm:flex-row"><div className="flex-1 text-center sm:text-left"><span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Voice-first assistant</span><h2 className="mt-2 text-2xl font-bold">What would you like to get done?</h2><p className="mt-2 text-sm text-indigo-100/80">Microphone is optional. Try commands below or manage tasks directly.</p></div><button aria-label="Voice input unavailable in isolated preview; use command field" title="Use the text command field in this demo" className="grid size-24 place-items-center rounded-full border-8 border-white/20 bg-white text-indigo-700"><Mic size={34}/></button></div><form onSubmit={submit} className="mt-5 flex gap-2"><label className="sr-only" htmlFor="demo-command">Try a task command</label><input id="demo-command" value={command} onChange={e=>setCommand(e.target.value)} placeholder="Add, find, update, complete or reopen a task…" className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-indigo-100/65 focus:outline-none focus:ring-2 focus:ring-white"/><button className="rounded-xl bg-white px-4 font-bold text-indigo-700" type="submit"><Plus size={18}/></button></form><div className="mt-3 flex flex-wrap gap-2">{examples.map(x=><button key={x} onClick={()=>handleCommand(x)} className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-indigo-50 hover:bg-white/10">{x}</button>)}</div><div aria-live="polite" className="mt-4 flex flex-wrap justify-between gap-2 text-sm"><span>{reply}</span><span className="text-xs text-indigo-100">{engine}</span></div></section>
    <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Total",counts.total],["Pending",counts.pending],["In progress",counts.progress],["Completed",counts.done]].map(([label,value])=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></article>)}</section>
    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Sample tasks</h2><span className="text-xs text-slate-500">{tasks.length} tasks</span></div>{tasks.map(task=><article key={task.id} className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-4"><span className="text-indigo-600">{task.status==="COMPLETED"?<Check size={18}/>:<Circle size={18}/>}</span><div className="min-w-0 flex-1"><p className={`font-semibold ${task.status==="COMPLETED"?"text-slate-400 line-through":"text-slate-800"}`}>{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.priority} · {task.status.replace("_"," ")}</p></div><div className="flex gap-2"><button title="Edit task" aria-label={`Edit ${task.title}`} onClick={()=>{const title=window.prompt("Edit task title",task.title);if(title?.trim())commit(tasks.map(t=>t.id===task.id?{...t,title:title.trim()}:t))}} className="rounded-lg border px-3 py-2 text-xs font-semibold">Edit</button>{task.status==="COMPLETED"?<button onClick={()=>commit(tasks.map(t=>t.id===task.id?{...t,status:"PENDING"}:t))} className="rounded-lg border px-3 py-2 text-xs font-semibold"><RotateCcw size={14}/></button>:<button onClick={()=>commit(tasks.map(t=>t.id===task.id?{...t,status:"COMPLETED"}:t))} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Complete</button>}<button title="Remove demo task" onClick={()=>commit(tasks.filter(t=>t.id!==task.id))} className="rounded-lg border px-3 py-2 text-xs text-slate-500"><Trash2 size={14}/></button></div></article>)}</section><p className="mt-5 text-center text-xs text-slate-500">Sample data is stored only in this tab’s session storage and expires when the tab closes.</p></div></main>
}

export function parseCommand(text, tasks) {
  const source = text.trim();
  const s = source.toLowerCase();
  if (/^(show|list|what are|what's|find|search).*(task|today|to.?do)/.test(s)) return { action: /\b(find|search)\b/.test(s) ? "SEARCH_TASKS" : "LIST_TASKS" };
  let action;
  if (/\b(reopen|re-open)\b/.test(s)) action = "REOPEN_TASK";
  else if (/\b(complete|finish|done)\b/.test(s)) action = "COMPLETE_TASK";
  else if (/\b(update|rename|change)\b/.test(s)) action = "UPDATE_TASK";
  else if (/\b(add|create|remind me to|new task)\b/.test(s)) {
    const title = source.replace(/^(please\s+)?(?:add|create)\s+(?:a\s+)?(?:task\s+)?/i, "").replace(/^(?:new task|remind me to)\s*/i, "").replace(/\b(?:urgent|high priority|medium priority|low priority)\b/ig, "").replace(/\b(?:by|on|tomorrow|today)\b.*$/i, "").replace(/\btask\b/ig, "").replace(/\s+/g, " ").trim();
    if (title.length < 2) return null;
    return { action: "CREATE_TASK", title: title[0].toUpperCase() + title.slice(1), priority: /urgent/.test(s) ? "URGENT" : /high priority/.test(s) ? "HIGH" : /low priority/.test(s) ? "LOW" : "MEDIUM" };
  } else return null;
  const matches = tasks.filter(task => {
    const words = task.title.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    return words.filter(word => s.includes(word)).length >= Math.min(2, words.length);
  });
  if (matches.length !== 1) return null;
  return { action, target: matches[0].title.toLowerCase() };
}
