#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Minimal .env loader (no dependency on dotenv)
function loadEnv() {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) return;
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const lineRaw of text.split(/\r?\n/)) {
      const line = lineRaw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

loadEnv();

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const apiKey = process.env.GEMINI_API_KEY || '';
const DEFAULT_AI_CUSTOM_QUERY =
  'Analyze the provided video file, including its audio.;Summarize the main points of the video concisely.;Create a chapter breakdown with timestamps for key sections or topics discussed.';
if (!apiKey) {
  console.error('GEMINI_API_KEY not set. Add it to .env or export it in the environment.');
  process.exit(1);
}

function buildPrompt(url, customPrompt) {
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

async function callGemini(url, customPrompt) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: buildPrompt(url, customPrompt) }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      responseMimeType: 'application/json'
    }
  };

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `Gemini failed ${res.status}: ${text}` };
  }
  const data = await res.json().catch(() => null);
  const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textPart) return { ok: false, error: 'No content returned' };
  let parsed = null;
  try {
    parsed = JSON.parse(textPart);
  } catch {
    const match = /```(?:json)?\n([\s\S]*?)\n```/.exec(textPart);
    if (match) {
      try { parsed = JSON.parse(match[1]); } catch {}
    }
  }
  const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];
  const cleaned = segments
    .map((s) => {
      const start = Number(s?.startSeconds);
      const end = Number(s?.endSeconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      const title = String(s?.title || 'Segment').slice(0, 120);
      const summary = s?.summary ? String(s.summary).slice(0, 2000) : undefined;
      return { title, startSeconds: Math.max(0, Math.floor(start)), endSeconds: Math.max(0, Math.floor(end)), summary };
    })
    .filter(Boolean);
  return { ok: true, segments: cleaned };
}

function runYtDlpJ(url) {
  const bin = process.env.YTDLP_PATH || 'yt-dlp';
  return new Promise((resolve) => {
    const proc = spawn(bin, ['--ignore-config', '-s', '-J', url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(out);
          const chapters = info?.chapters || info?.requested_downloads?.[0]?.chapters || [];
          resolve({ ok: true, hasChapters: Array.isArray(chapters) && chapters.length > 0, chapterCount: chapters?.length || 0 });
        } catch (e) {
          resolve({ ok: false, error: 'parse failed' });
        }
      } else {
        resolve({ ok: false, error: err || `yt-dlp exit ${code}` });
      }
    });
    proc.on('error', (e) => resolve({ ok: false, error: String(e) }));
  });
}

async function main() {
  const [url, ...promptParts] = process.argv.slice(2);
  if (!url) {
    console.error('Usage: node scripts/test-gemini.mjs <youtube_url> [custom prompt]');
    process.exit(1);
  }
  const customPrompt = (promptParts.join(' ').trim()) || DEFAULT_AI_CUSTOM_QUERY;
  console.log(`Checking chapters via yt-dlp...`);
  const ch = await runYtDlpJ(url);
  if (ch.ok) {
    console.log(`Chapters present: ${ch.hasChapters ? 'YES' : 'NO'}${ch.hasChapters ? ` (count=${ch.chapterCount})` : ''}`);
  } else {
    console.log('yt-dlp check failed:', ch.error);
  }
  console.log(`\nRequesting Gemini suggestions using model: ${GEMINI_MODEL}...`);
  const ai = await callGemini(url, customPrompt);
  if (!ai.ok) {
    console.error('Gemini error:', ai.error);
    process.exit(2);
  }
  if (!ai.segments?.length) {
    console.log('No segments returned.');
  } else {
    console.log(JSON.stringify({ segments: ai.segments }, null, 2));
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(99);
});
