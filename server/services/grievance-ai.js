import { z } from "zod";

const categories = ["Infrastructure", "Electricity", "Water", "Cleanliness", "Academics", "Transport", "IT Support", "Other"];
const priorities = ["Low", "Medium", "High", "Critical"];
const schema = z.object({ title: z.string().min(3).max(200), description: z.string().min(8).max(5000), category: z.union([z.enum(categories), z.literal("")]), location: z.string().max(200), priority: z.union([z.enum(priorities), z.literal("")]), occurredAt: z.string().datetime().nullable() }).strict();

export async function interpretGrievance(text, fetchImpl = fetch) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ systemInstruction: { parts: [{ text: "Extract only facts explicitly stated in the complaint. Never infer a location, date, category or severity. If category, location or priority is missing, leave its field empty. Map urgency only when explicitly stated. Return JSON only." }] }, contents: [{ role: "user", parts: [{ text }] }], generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" }, category: { type: "STRING" }, location: { type: "STRING" }, priority: { type: "STRING" }, occurredAt: { type: ["STRING", "NULL"] } }, required: ["title", "description", "category", "location", "priority", "occurredAt"] } } }) });
      if (response.ok) { const payload = await response.json(); const textOut = payload?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join(""); const data = schema.safeParse(JSON.parse(textOut)); if (data.success) return { ...data.data, processedBy: "gemini" }; }
    } catch { /* Safe local extraction below; never persist unvalidated model output. */ }
  }
  return { ...parseComplaintLocally(text), processedBy: "local" };
}

export function parseComplaintLocally(text) {
  const source = String(text || "").trim();
  const lower = source.toLocaleLowerCase();
  const category = lower.includes("electric") || lower.includes("power") ? "Electricity" : /\b(water|tap|pipe|leak)\b/.test(lower) ? "Water" : /\b(clean|garbage|trash|dirty|sanitation)\b/.test(lower) ? "Cleanliness" : /\b(teacher|class|grade|academic|exam)\b/.test(lower) ? "Academics" : /\b(bus|transport|shuttle)\b/.test(lower) ? "Transport" : /\b(wifi|computer|login|it support|network)\b/.test(lower) ? "IT Support" : /\b(building|door|roof|classroom|infrastructure)\b/.test(lower) ? "Infrastructure" : "";
  const location = source.match(/\b(?:at|in|near)\s+([\w -]{2,60})/i)?.[1]?.trim() || "";
  const priority = /\b(emergency|danger|critical|urgent|immediate)\b/.test(lower) ? "Critical" : /\bhigh priority\b/.test(lower) ? "High" : /\blow priority\b/.test(lower) ? "Low" : /\bmedium priority\b/.test(lower) ? "Medium" : "";
  return { title: source.slice(0, 120), description: source, category, location, priority, occurredAt: null };
}
