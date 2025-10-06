import { env } from "node:process";

export type AiSegment = {
  title: string;
  startSeconds: number;
  endSeconds: number;
  summary?: string;
};

const GEMINI_MODEL = env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function buildPrompt(url: string, customPrompt?: string) {
  const base = `You are given a YouTube URL. Analyze the content and propose a concise outline of the most useful subtopics with precise timestamps (in seconds from the start). Return strictly valid JSON with the following shape:
{
  "segments": [
    { "title": string, "startSeconds": number, "endSeconds": number, "summary": string }
  ]
}
Rules:
- startSeconds < endSeconds
- Prefer 3 to 12 segments depending on content length
- Titles should be short nouns or phrases
- summary is 1-2 sentences, helpful and specific
- Output ONLY the JSON, no markdown, no commentary.
Target video: ${url}`;
  if (customPrompt && customPrompt.trim()) {
    return `${base}\nAdditional instructions: ${customPrompt.trim()}`;
  }
  return base;
}

/**
 * Given a list of verbose subtopic descriptions, ask Gemini to produce concise, unique
 * short titles suitable for UI and filenames.
 * Returns the same number of titles as inputs, or an empty array on failure.
 */
export async function suggestShortTitlesFromText(
  descriptions: string[],
  opts?: { courseTitle?: string; maxLength?: number }
): Promise<string[]> {
  const apiKey = env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.warn("[AI] GEMINI_API_KEY not set; skipping title suggestion");
    return [];
  }
  const maxLen = Math.max(20, Math.min(100, opts?.maxLength ?? 60));
  // Build prompt to rewrite each item into a concise title
  const prompt = `You are given ${descriptions.length} subtopic descriptions${opts?.courseTitle ? ` from a course titled: ${opts.courseTitle}` : ""}.
For each description, output a concise, unique short title only, with these rules:
- Max ${maxLen} characters
- Title case where appropriate
- No numbering or quotes
- Avoid duplicates; if two are similar, make them distinct
Return strictly valid JSON in this shape:
{ "titles": [ string, ... ] }
Descriptions:
${descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;

  const body: any = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      responseMimeType: "application/json"
    }
  };

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[AI] Gemini (titles) request failed:", res.status, text);
    return [];
  }
  const data: any = await res.json().catch(() => null);
  const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textPart) return [];
  let parsed: any = null;
  try {
    parsed = JSON.parse(textPart);
  } catch {
    const match = /```(?:json)?\n([\s\S]*?)\n```/.exec(textPart);
    if (match) {
      try {
        parsed = JSON.parse(match[1]);
      } catch {}
    }
  }
  const titles = parsed?.titles;
  if (!Array.isArray(titles)) return [];
  return titles.map((t: any) => String(t || "").slice(0, maxLen));
}

function buildPromptFromTranscript(url: string, transcript: string, customPrompt?: string) {
  const base = `You are given a YouTube video and its transcript with timestamps. Using ONLY the transcript, propose a concise outline of the most useful subtopics with precise timestamps (in seconds from the start). Return strictly valid JSON with the following shape:
{
  "segments": [
    { "title": string, "startSeconds": number, "endSeconds": number, "summary": string }
  ]
}
Rules:
- startSeconds < endSeconds
- Prefer 3 to 12 segments depending on content length
- Titles should be short nouns or phrases
- summary is 1-2 sentences, helpful and specific
- Output ONLY the JSON, no markdown, no commentary.
Target video: ${url}
Transcript (timestamped, may be truncated):\n---\n${transcript}\n---`;
  if (customPrompt && customPrompt.trim()) {
    return `${base}\nAdditional instructions: ${customPrompt.trim()}`;
  }
  return base;
}

export async function suggestYouTubeSegments(
  url: string,
  customPrompt?: string
): Promise<AiSegment[]> {
  const apiKey = env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.warn("[AI] GEMINI_API_KEY not set; returning empty segment list");
    return [];
  }
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(url, customPrompt) }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      // Ask for raw JSON
      responseMimeType: "application/json"
    }
  } as any;

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[AI] Gemini request failed:", res.status, text);
    return [];
  }

  const data: any = await res.json().catch(() => null);
  if (!data) return [];

  // Try to extract the JSON payload from candidates
  const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textPart) return [];

  let parsed: any = null;
  try {
    parsed = JSON.parse(textPart);
  } catch {
    // try to extract from code fence
    const match = /```(?:json)?\n([\s\S]*?)\n```/.exec(textPart);
    if (match) {
      try {
        parsed = JSON.parse(match[1]);
      } catch {}
    }
  }
  const segments = parsed?.segments;
  if (!Array.isArray(segments)) return [];
  const cleaned = segments
    .map((s: any) => {
      const start = Number(s?.startSeconds);
      const end = Number(s?.endSeconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      const title = String(s?.title || "Segment").slice(0, 120);
      const summary = s?.summary ? String(s.summary).slice(0, 2000) : undefined;
      return { title, startSeconds: Math.max(0, Math.floor(start)), endSeconds: Math.max(0, Math.floor(end)), summary } as AiSegment;
    })
    .filter((s): s is AiSegment => s !== null);
  return cleaned;
}

export async function suggestSegmentsFromTranscript(
  url: string,
  transcript: string,
  customPrompt?: string
): Promise<AiSegment[]> {
  const apiKey = env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.warn("[AI] GEMINI_API_KEY not set; returning empty segment list");
    return [];
  }
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPromptFromTranscript(url, transcript, customPrompt) }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      responseMimeType: "application/json"
    }
  } as any;

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[AI] Gemini (transcript) request failed:", res.status, text);
    return [];
  }
  const data: any = await res.json().catch(() => null);
  const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textPart) return [];
  let parsed: any = null;
  try {
    parsed = JSON.parse(textPart);
  } catch {
    const match = /```(?:json)?\n([\s\S]*?)\n```/.exec(textPart);
    if (match) {
      try {
        parsed = JSON.parse(match[1]);
      } catch {}
    }
  }
  const segments = parsed?.segments;
  if (!Array.isArray(segments)) return [];
  return segments
    .map((s: any) => {
      const start = Number(s?.startSeconds);
      const end = Number(s?.endSeconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      const title = String(s?.title || "Segment").slice(0, 120);
      const summary = s?.summary ? String(s.summary).slice(0, 2000) : undefined;
      return { title, startSeconds: Math.max(0, Math.floor(start)), endSeconds: Math.max(0, Math.floor(end)), summary } as AiSegment;
    })
    .filter((s): s is AiSegment => s !== null);
}
