"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestSegmentsOss = suggestSegmentsOss;
const node_process_1 = require("node:process");
const DEFAULT_AI_CUSTOM_QUERY = "Analyze the provided video file, including its audio.;Summarize the main points of the video concisely.;Create a chapter breakdown with timestamps for key sections or topics discussed.";
function buildPromptFromTranscript(url, transcript, customPrompt) {
    const instructions = customPrompt?.trim() || DEFAULT_AI_CUSTOM_QUERY;
    return `You are given a YouTube video and its transcript. Using the transcript only, propose a concise outline with precise timestamps in seconds from start. Return strictly valid JSON with shape:\n{\n  \"segments\": [\n    { \"title\": string, \"startSeconds\": number, \"endSeconds\": number, \"summary\": string }\n  ]\n}\nRules:\n- startSeconds < endSeconds\n- Prefer 3 to 12 segments depending on content length\n- Titles should be short nouns or phrases\n- summary is 1-2 sentences\n- Output ONLY the JSON, no markdown.\nTarget video: ${url}\nInstructions: ${instructions}\nTranscript (may be truncated):\n---\n${transcript}\n---`;
}
async function suggestSegmentsOss(params) {
    const baseUrl = node_process_1.env.OSS_OPENAI_BASE_URL || node_process_1.env.OPENAI_BASE_URL || "";
    const apiKey = node_process_1.env.OSS_OPENAI_API_KEY || node_process_1.env.OPENAI_API_KEY || "";
    const model = node_process_1.env.OSS_OPENAI_MODEL || node_process_1.env.OPENAI_MODEL || "llama3.1";
    if (!baseUrl) {
        console.warn("[OSS LLM] OSS_OPENAI_BASE_URL not set; returning empty segments");
        return [];
    }
    const prompt = buildPromptFromTranscript(params.videoUrl, params.transcript, params.customPrompt);
    const body = {
        model,
        messages: [
            { role: "system", content: "You are a helpful assistant that outputs strict JSON only." },
            { role: "user", content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
    };
    let res;
    try {
        res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify(body)
        });
    }
    catch (e) {
        console.warn("[OSS LLM] request failed:", e);
        return [];
    }
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[OSS LLM] request non-200:", res.status, text);
        return [];
    }
    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (!content)
        return [];
    let parsed = null;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        const match = /```(?:json)?\n([\s\S]*?)\n```/.exec(content);
        if (match) {
            try {
                parsed = JSON.parse(match[1]);
            }
            catch { }
        }
    }
    const segments = parsed?.segments;
    if (!Array.isArray(segments))
        return [];
    return segments
        .map((s) => {
        const start = Number(s?.startSeconds);
        const end = Number(s?.endSeconds);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
            return null;
        const title = String(s?.title || "Segment").slice(0, 120);
        const summary = s?.summary ? String(s.summary).slice(0, 2000) : undefined;
        return { title, startSeconds: Math.max(0, Math.floor(start)), endSeconds: Math.max(0, Math.floor(end)), summary };
    })
        .filter((s) => s !== null);
}
