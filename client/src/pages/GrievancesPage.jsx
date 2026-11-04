import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Mic, MicOff, Send, ShieldCheck, Ticket } from "lucide-react";
import { apiGet, apiMutation } from "../api/client.js";
import { useAuth } from "../app/AuthProvider.jsx";

const STATUSES = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "REJECTED"];
const CATEGORIES = ["Infrastructure", "Electricity", "Water", "Cleanliness", "Academics", "Transport", "IT Support", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const EXAMPLES = ["The water tap is leaking near the library", "The classroom lights are not working in Block B", "Wi-Fi keeps disconnecting in the computer lab"];

export function GrievancesPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <main className="grid min-h-screen place-items-center text-slate-500">Restoring your secure session…</main>;
  if (!user) return <main className="min-h-screen bg-slate-50 px-5 py-16"><section className="mx-auto max-w-lg rounded-3xl border bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-indigo-600" size={34}/><h1 className="mt-4 text-2xl font-bold">Sign in to report and track issues</h1><p className="mt-2 text-sm leading-6 text-slate-500">Grievances are private to your account. Sign in or create an account to continue.</p><Link className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white" to="/login">Sign in</Link></section></main>;
  return <GrievanceWorkspace user={user}/>;
}

function GrievanceWorkspace({ user }) {
  const client = useQueryClient();
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState(false);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ status: "", category: "", priority: "", q: "" });
  const [selected, setSelected] = useState("");
  const [recognition, setRecognition] = useState(null);
  const [trackQuery, setTrackQuery] = useState("");
  const [trackedTicket, setTrackedTicket] = useState(null);
  const [trackMessage, setTrackMessage] = useState("");
  const [tracking, setTracking] = useState(false);
  const admin = user.role === "ADMIN";
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const ticketsQuery = useQuery({ queryKey: ["grievances", filters], queryFn: async () => (await apiGet("/grievances?" + params)).data, retry: false });
  const adminQuery = useQuery({ queryKey: ["grievances", "admin"], queryFn: async () => apiGet("/grievances/admin"), enabled: admin, retry: false });
  const submitMutation = useMutation({ mutationFn: async ({ text, mode }) => apiMutation("/grievances", "POST", { text, mode }), onSuccess: (result) => { if (result.data && result.data.needsClarification) { setNotice(result.data.question); return; } setTranscript(""); setNotice("Ticket " + result.data.ticketId + " was submitted. Status: Open. Structured by " + (result.processedBy === "gemini" ? "Gemini." : "the local fallback.")); setSelected(result.data.ticketId); client.invalidateQueries({ queryKey: ["grievances"] }); } });
  const statusMutation = useMutation({ mutationFn: ({ ticketId, status, version, resolutionNotes }) => apiMutation("/grievances/" + encodeURIComponent(ticketId) + "/status", "PATCH", { status, resolutionNotes, version }), onSuccess: () => client.invalidateQueries({ queryKey: ["grievances"] }) });
  const tickets = ticketsQuery.data || [];
  const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.ticketId === selected), [tickets, selected]);

  function startVoice() {
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) { setNotice("Voice recognition is not available in this browser. Type your complaint instead."); return; }
    const voice = new Recognition(); voice.lang = navigator.language || "en-US"; voice.interimResults = true; voice.continuous = false;
    voice.onstart = () => { setVoiceTranscript(true); setListening(true); setNotice("Listening… describe what happened and where."); };
    voice.onresult = (event) => { setTranscript(Array.from(event.results).map((item) => item[0] && item[0].transcript || "").join("")); };
    voice.onerror = (event) => { setListening(false); setRecognition(null); setNotice(event.error === "not-allowed" ? "Microphone access was denied. Type your complaint instead." : "Voice recognition stopped. Review or type your complaint."); };
    voice.onend = () => { setListening(false); setRecognition(null); };
    setRecognition(voice); voice.start();
  }
  function stopVoice() { if (recognition) recognition.stop(); setListening(false); setRecognition(null); }
  function submit(event) { event.preventDefault(); if (transcript.trim()) submitMutation.mutate({ text: transcript.trim(), mode: voiceTranscript ? "voice_transcript" : "text" }); }
  async function findProgress(event) {
    event.preventDefault(); if (!trackQuery.trim()) return;
    setTracking(true); setTrackMessage(""); setTrackedTicket(null);
    try { const response = await apiGet("/grievances?q=" + encodeURIComponent(trackQuery.trim())); const exact = response.data.find((item) => item.ticketId.toLowerCase() === trackQuery.trim().toLowerCase()); const found = exact || (response.data.length === 1 ? response.data[0] : null); if (found) { setTrackedTicket(found); setSelected(found.ticketId); setTrackMessage("Current ticket status: " + found.status.replaceAll("_", " ") + "."); } else setTrackMessage(response.data.length ? "More than one ticket matches. Add a ticket ID or a more specific phrase." : "No ticket matched that ID or description."); }
    catch (error) { setTrackMessage(error.message); } finally { setTracking(false); }
  }
  function startProgressVoice() {
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) { setTrackMessage("Voice recognition is unavailable here. Type a ticket ID or keywords."); return; }
    const voice = new Recognition(); voice.lang = navigator.language || "en-US"; voice.interimResults = true; voice.continuous = false;
    voice.onresult = (event) => setTrackQuery(Array.from(event.results).map((item) => item[0] && item[0].transcript || "").join(""));
    voice.onerror = (event) => setTrackMessage(event.error === "not-allowed" ? "Microphone access was denied. Type a ticket ID or keywords." : "Voice lookup stopped. You can type instead.");
    voice.start();
  }

  const adminTickets = adminQuery.data && adminQuery.data.data || [];
  return <main className="min-h-screen bg-[#f5f6fb] px-4 py-6 text-slate-900 sm:px-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link to="/" className="text-sm font-semibold text-indigo-700">← AI Task Manager</Link><h1 className="mt-3 text-3xl font-extrabold tracking-tight">Voice Grievance Desk</h1><p className="mt-1 text-sm text-slate-500">Report an issue, review the transcript, and follow its ticket.</p></div><span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-500">Private to {user.preferredName}</span></header>
    <section className="mt-6 rounded-3xl bg-gradient-to-br from-[#202653] to-[#5255b5] p-5 text-white shadow-xl sm:p-8"><div className="flex flex-col items-center gap-5 sm:flex-row"><div className="flex-1 text-center sm:text-left"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-200">New complaint</p><h2 className="mt-2 text-2xl font-bold">Tell us what happened</h2><p className="mt-2 text-sm leading-6 text-indigo-100/80">Speak naturally. We’ll organize the details and ask when essential information is missing.</p></div><button type="button" aria-label={listening ? "Stop voice input" : "Start voice complaint"} onClick={listening ? stopVoice : startVoice} disabled={submitMutation.isPending} className="grid size-24 shrink-0 place-items-center rounded-full border-8 border-white/20 bg-white text-indigo-700 shadow-lg hover:scale-105 disabled:opacity-70">{listening ? <MicOff size={34}/> : <Mic size={34}/>}</button></div>
      <form onSubmit={submit}><label htmlFor="grievance-transcript" className="mt-6 block text-sm font-semibold text-indigo-100">Recognized transcript / complaint</label><textarea id="grievance-transcript" rows="4" maxLength={5000} value={transcript} onChange={(event) => { setTranscript(event.target.value); setVoiceTranscript(false); }} placeholder="For example: The water tap is leaking near the library…" className="mt-2 w-full resize-y rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-indigo-100/60 outline-none focus:ring-2 focus:ring-white"/><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span aria-live="polite" className="text-sm text-indigo-100">{submitMutation.isPending ? "Understanding your complaint…" : notice || (listening ? "Listening…" : "Review the transcript before submitting.")}</span><button disabled={!transcript.trim() || submitMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-indigo-800 disabled:opacity-50"><Send size={16}/>Submit complaint</button></div></form>
      {submitMutation.error && <p role="alert" className="mt-3 rounded-xl bg-rose-100/15 px-4 py-3 text-sm text-white">{submitMutation.error.message} Your transcript is still here; you can retry.</p>}
      <div className="mt-4 flex flex-wrap gap-2">{EXAMPLES.map((example) => <button type="button" key={example} onClick={() => setTranscript(example)} className="rounded-full border border-white/25 px-3 py-2 text-xs text-white hover:bg-white/10">Use: {example}</button>)}</div>
      <p className="mt-4 text-xs text-indigo-100/70">Speech recognition uses your browser. Microphone permission is optional; text entry is always available.</p>
    </section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="font-bold">Check ticket progress</h2><p className="mt-1 text-sm text-slate-500">Say or type a ticket ID or distinctive words from your report.</p><form onSubmit={findProgress} className="mt-3 flex flex-wrap gap-2"><input aria-label="Ticket progress query" value={trackQuery} onChange={(event)=>setTrackQuery(event.target.value)} placeholder="For example, GR-… or library water leak" className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm"/><button type="button" onClick={startProgressVoice} aria-label="Speak ticket progress query" className="rounded-xl border px-3 py-2.5 text-sm font-semibold">Speak</button><button disabled={!trackQuery.trim()||tracking} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{tracking?"Checking…":"Check status"}</button></form>{trackMessage&&<p aria-live="polite" className="mt-3 text-sm text-slate-600">{trackMessage}</p>}{trackedTicket&&<div className="mt-3 rounded-xl bg-indigo-50 p-4"><p className="font-bold">{trackedTicket.ticketId} · {trackedTicket.status.replaceAll("_"," ")}</p><p className="mt-1 text-sm text-slate-600">{trackedTicket.title} · Updated {new Date(trackedTicket.updatedAt).toLocaleString()}</p></div>}</section>
    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Your tickets</h2><p className="mt-1 text-sm text-slate-500">Track status, priority and updates.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">{tickets.length} shown</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input aria-label="Search ticket ID or keywords" placeholder="Search ID or keywords" value={filters.q} onChange={(event)=>setFilters({...filters,q:event.target.value})} className="rounded-xl border px-3 py-2 text-sm"/><select aria-label="Filter status" value={filters.status} onChange={(event)=>setFilters({...filters,status:event.target.value})} className="rounded-xl border px-3 py-2 text-sm"><option value="">All statuses</option>{STATUSES.map(value=><option key={value}>{value}</option>)}</select><select aria-label="Filter category" value={filters.category} onChange={(event)=>setFilters({...filters,category:event.target.value})} className="rounded-xl border px-3 py-2 text-sm"><option value="">All categories</option>{CATEGORIES.map(value=><option key={value}>{value}</option>)}</select><select aria-label="Filter priority" value={filters.priority} onChange={(event)=>setFilters({...filters,priority:event.target.value})} className="rounded-xl border px-3 py-2 text-sm"><option value="">All priorities</option>{PRIORITIES.map(value=><option key={value}>{value}</option>)}</select></div>
      {ticketsQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading your tickets…</p> : ticketsQuery.error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Tickets could not be loaded: {ticketsQuery.error.message}</p> : tickets.length ? <div className="mt-4 grid gap-3">{tickets.map(ticket=><TicketCard key={ticket.ticketId} ticket={ticket} selected={selected===ticket.ticketId} onSelect={()=>setSelected(selected===ticket.ticketId?"":ticket.ticketId)}/>)}</div> : <div className="py-10 text-center"><Ticket className="mx-auto text-slate-300" size={30}/><p className="mt-3 font-bold">No tickets match</p><p className="mt-1 text-sm text-slate-500">Submit an issue or adjust your filters.</p></div>}
      {selectedTicket && <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5"><h3 className="font-bold">Ticket timeline · {selectedTicket.ticketId}</h3><ol className="mt-4 space-y-3">{(selectedTicket.history||[]).map((item,index)=><li className="flex gap-3 text-sm" key={item.status + index}><span className="mt-0.5 text-indigo-600"><Clock3 size={16}/></span><span><strong>{item.status.replaceAll("_"," ")}</strong><span className="block text-slate-500">{item.note} · {new Date(item.changedAt).toLocaleString()}</span></span></li>)}</ol>{selectedTicket.resolutionNotes&&<p className="mt-4 rounded-xl bg-white p-3 text-sm"><strong>Resolution notes:</strong> {selectedTicket.resolutionNotes}</p>}</div>}
    </section>
    {admin && <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-xl font-bold">Administrator desk</h2><p className="mt-1 text-sm text-slate-500">All submitted tickets · status statistics</p>{adminQuery.data && <div className="mt-3 flex flex-wrap gap-2">{adminQuery.data.statistics.map(item=><span key={item._id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">{item._id}: {item.count}</span>)}</div>}{adminQuery.isError&&<p role="alert" className="mt-3 text-sm text-rose-700">Admin tickets could not be loaded.</p>}<div className="mt-4 space-y-3">{adminTickets.map(ticket=><AdminTicket key={ticket.ticketId} ticket={ticket} onChange={(status, resolutionNotes)=>statusMutation.mutate({ticketId:ticket.ticketId,status,version:ticket.version,resolutionNotes})}/>)}</div></section>}
  </div></main>;
}

function AdminTicket({ ticket, onChange }) { const [status, setStatus] = useState(ticket.status); const [notes, setNotes] = useState(ticket.resolutionNotes || ""); return <article className="flex flex-wrap items-center gap-3 rounded-xl border p-3"><span className="min-w-0 flex-1"><strong>{ticket.ticketId}</strong> · {ticket.title}<small className="block text-slate-500">{ticket.category} · {ticket.priority}</small></span><input aria-label={"Resolution notes for " + ticket.ticketId} value={notes} onChange={(event)=>setNotes(event.target.value)} placeholder="Resolution notes" maxLength={4000} className="min-w-40 rounded-lg border px-2 py-2 text-xs"/><select aria-label={"Update status for " + ticket.ticketId} value={status} onChange={(event)=>setStatus(event.target.value)} className="rounded-lg border px-2 py-2 text-xs">{STATUSES.map(value=><option key={value}>{value}</option>)}</select><button onClick={()=>onChange(status,notes)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Save update</button></article>; }
function TicketCard({ ticket, selected, onSelect }) {
  const tone = { OPEN:"bg-blue-50 text-blue-700", UNDER_REVIEW:"bg-violet-50 text-violet-700", IN_PROGRESS:"bg-amber-50 text-amber-800", RESOLVED:"bg-emerald-50 text-emerald-800", REJECTED:"bg-slate-100 text-slate-600" }[ticket.status];
  return <button onClick={onSelect} aria-expanded={selected} className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:shadow-sm"><div className="flex flex-wrap items-start gap-3"><span className="min-w-0 flex-1"><span className="text-xs font-extrabold text-indigo-600">{ticket.ticketId}</span><strong className="mt-1 block">{ticket.title}</strong></span><span className={"rounded-full px-3 py-1 text-[10px] font-extrabold " + tone}>{ticket.status.replaceAll("_"," ")}</span></div><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{ticket.description}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2.5 py-1">{ticket.category}</span><span className="rounded-full bg-slate-100 px-2.5 py-1">{ticket.priority}</span>{ticket.location&&<span className="rounded-full bg-slate-100 px-2.5 py-1">{ticket.location}</span>}<time className="ml-auto text-slate-400">Submitted {new Date(ticket.createdAt).toLocaleString()}</time></div></button>;
}
