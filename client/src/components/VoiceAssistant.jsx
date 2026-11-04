import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Keyboard, LoaderCircle, Mic, MicOff, Send, Sparkles, Volume2 } from "lucide-react";
import { apiMutation } from "../api/client.js";

export function VoiceAssistant({ user, onCommandResult }) {
  const [support, setSupport] = useState(null);
  const [status, setStatus] = useState("ready");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [reply, setReply] = useState("");
  const [processedBy, setProcessedBy] = useState("");
  const [error, setError] = useState("");
  const [textCommand, setTextCommand] = useState("");
  const recognizerRef = useRef(null);
  const voiceModeRef = useRef(false);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const queueRef = useRef([]);
  const startRecognitionRef = useRef(() => {});

  const speak = useCallback((text) => new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    recognizerRef.current?.stop();
    speakingRef.current = true;
    setStatus("speaking");
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = user.language && user.language !== "en" ? user.language : "en-US";
    utterance.rate = 1;
    const finish = () => {
      speakingRef.current = false;
      resolve();
      if (voiceModeRef.current && !processingRef.current) startRecognitionRef.current();
      else setStatus("ready");
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }), [user.language]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length) {
        const command = queueRef.current.shift();
        setTranscript(command.text);
        setInterim("");
        setError("");
        setStatus("processing");
        try {
          const result = await apiMutation("/assistant/messages", "POST", {
            text: command.text,
            mode: command.mode,
          });
          setReply(result.reply);
          setProcessedBy(result.processedBy === "local" ? "Local fallback" : "Gemini");
          onCommandResult(result);
          await speak(result.reply);
        } catch (requestError) {
          setError(friendlyAssistantError(requestError));
          setStatus("error");
          if (voiceModeRef.current) await speak(friendlyAssistantError(requestError));
        }
      }
    } finally {
      processingRef.current = false;
      if (voiceModeRef.current && !speakingRef.current) startRecognitionRef.current();
      else if (!speakingRef.current) setStatus("ready");
    }
  }, [onCommandResult, speak]);

  const enqueueCommand = useCallback((text, mode) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    queueRef.current.push({ text: cleanText, mode });
    setTranscript(cleanText);
    void processQueue();
  }, [processQueue]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSupport(false);
      return undefined;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = user.language && user.language !== "en" ? user.language : "en-US";
    recognizerRef.current = recognition;
    setSupport(true);

    recognition.onstart = () => setStatus("listening");
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) finalText += `${phrase} `;
        else interimText += phrase;
      }
      setInterim(interimText.trim());
      if (finalText.trim()) enqueueCommand(finalText, "voice_transcript");
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (["not-allowed", "service-not-allowed"].includes(event.error)) voiceModeRef.current = false;
      setError(event.error === "not-allowed"
        ? "Microphone permission is off. Allow microphone access or type a command instead."
        : "Voice recognition was interrupted. You can restart it or type a command.");
      setStatus("error");
    };
    recognition.onend = () => {
      if (voiceModeRef.current && !speakingRef.current && !processingRef.current) {
        window.setTimeout(() => startRecognitionRef.current(), 180);
      } else if (!voiceModeRef.current && !processingRef.current && !speakingRef.current) {
        setStatus("ready");
      }
    };
    startRecognitionRef.current = () => {
      if (!voiceModeRef.current || speakingRef.current || processingRef.current) return;
      try { recognition.start(); } catch { /* A start already in progress is harmless. */ }
    };

    return () => {
      voiceModeRef.current = false;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.stop();
      window.speechSynthesis?.cancel();
      recognizerRef.current = null;
    };
  }, [enqueueCommand, user.language]);

  function toggleListening() {
    setError("");
    if (!support) {
      setError("Voice recognition isn’t available in this browser. You can type a command below.");
      document.getElementById("voice-text-command")?.focus();
      return;
    }
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      recognizerRef.current?.stop();
      window.speechSynthesis?.cancel();
      speakingRef.current = false;
      if (!processingRef.current) setStatus("ready");
      return;
    }
    voiceModeRef.current = true;
    startRecognitionRef.current();
  }

  function submitText(event) {
    event.preventDefault();
    if (!textCommand.trim()) return;
    enqueueCommand(textCommand, "text");
    setTextCommand("");
  }

  const isListening = status === "listening";
  const isBusy = status === "processing" || status === "speaking";

  return (
    <section aria-labelledby="voice-assistant-title" className="relative mt-7 overflow-hidden rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-[#202653] via-[#30376f] to-[#4b4eb2] px-5 py-7 text-white shadow-[0_24px_70px_-35px_rgba(45,49,112,0.65)] sm:px-8 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-1/3 size-96 rounded-full bg-indigo-400/15 blur-3xl" />
      <div className="relative grid items-center gap-7 lg:grid-cols-[1fr_auto_1fr] lg:gap-10">
        <div className="text-center lg:text-left">
          <p className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.17em] text-indigo-200"><Sparkles size={14} /> Your personal task assistant</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl" id="voice-assistant-title">What’s on your mind?</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-indigo-100/80 lg:mx-0">Say it naturally. I’ll take care of the task and keep your day up to date.</p>
          <p className="mt-4 hidden items-center gap-2 text-xs font-medium text-indigo-100/65 lg:flex"><AudioLines size={15} /> Voice stays on your device; only the transcript is sent securely.</p>
        </div>

        <div className="flex flex-col items-center">
          <button aria-label={isListening ? "Stop listening" : "Start voice assistant"} aria-pressed={voiceModeRef.current} className={`relative flex size-28 items-center justify-center rounded-full border-[7px] border-white/20 shadow-[0_16px_40px_-12px_rgba(4,6,25,0.55)] transition duration-200 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white sm:size-32 ${isListening ? "scale-105 bg-rose-500" : isBusy ? "bg-indigo-300 text-indigo-950" : "bg-white text-indigo-700 hover:scale-105 hover:bg-indigo-50"}`} onClick={toggleListening} type="button">
            {isListening && <span aria-hidden="true" className="absolute inset-[-13px] animate-ping rounded-full border border-rose-100/70" />}
            {status === "processing" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={38} /> : isListening ? <MicOff aria-hidden="true" size={37} /> : status === "speaking" ? <Volume2 aria-hidden="true" size={37} /> : <Mic aria-hidden="true" size={40} />}
          </button>
          <p aria-live="polite" className="mt-4 text-sm font-bold" role="status">{statusLabel(status, support)}</p>
          {support === false && <p className="mt-1 text-center text-xs text-indigo-100/75">Use the optional text command below.</p>}
        </div>

        <div className="min-h-24 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm">
          {transcript ? <p className="text-sm leading-6 text-white"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-indigo-200">Last command</span>{transcript}</p> : <p className="flex h-full min-h-16 items-center justify-center text-center text-sm text-indigo-100/70">{interim || "Try “Add a task to call Maya tomorrow.”"}</p>}
          {interim && transcript && <p className="mt-2 border-t border-white/10 pt-2 text-sm italic text-indigo-100/70">{interim}</p>}
          {reply && <p className="mt-3 flex items-start gap-2 border-t border-white/10 pt-3 text-sm font-semibold leading-5 text-emerald-100"><Volume2 aria-hidden="true" className="mt-0.5 shrink-0" size={15} />{reply}</p>}
          {processedBy && <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-indigo-200">Handled by {processedBy}</p>}
          {error && <p className="mt-3 rounded-xl bg-rose-200/15 px-3 py-2 text-xs font-semibold leading-5 text-rose-100" role="alert">{error}</p>}
        </div>
      </div>

      <details className="relative mx-auto mt-5 max-w-xl rounded-xl border border-white/10 bg-white/[0.05] open:bg-white/[0.08]">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-indigo-100 hover:text-white"><Keyboard size={15} /> Type a command instead</summary>
        <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={submitText}>
          <label className="sr-only" htmlFor="voice-text-command">Command</label>
          <input autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-indigo-100/50 focus:border-white/50" id="voice-text-command" maxLength={2000} onChange={(event) => setTextCommand(event.target.value)} placeholder="Add, find, complete, or update a task…" value={textCommand} />
          <button aria-label="Send command" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50" disabled={!textCommand.trim() || isBusy} type="submit"><Send size={16} /></button>
        </form>
      </details>
    </section>
  );
}

function statusLabel(status, supported) {
  if (status === "listening") return "I’m listening — go ahead";
  if (status === "processing") return "Thinking it through…";
  if (status === "speaking") return "Speaking";
  if (status === "error") return "I need a moment";
  if (supported === false) return "Voice isn’t available here";
  return "Tap the microphone to speak";
}

function friendlyAssistantError(error) {
  if (error.code === "AI_QUOTA_EXCEEDED") return "The free AI request limit has been reached. Your command is saved here; please try again later.";
  if (["AI_TIMEOUT", "AI_TEMPORARILY_UNAVAILABLE", "AI_UNAVAILABLE"].includes(error.code)) return "The assistant is temporarily unavailable. Your command is still here; please try again shortly.";
  if (error.code === "AI_MODEL_UNAVAILABLE") return "The free AI model is unavailable right now. Your command is still here.";
  return error.message || "I couldn’t complete that command. Your command is still here; please try again.";
}
