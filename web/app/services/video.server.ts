import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from 'crypto';
import { dirname, join, resolve as resolvePath, basename } from "node:path";
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { getTopicsFromAudio } from "./gemini.server";
// Google Cloud and Gemini imports will be dynamically imported when needed

// Video processing service utils + minimal yt-dlp integration per `design.md`

const YT_DLP_BIN = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_PATH || "";

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Export types and interfaces

export function vttToPlainTextWithTimestamps(vtt: string): string {
  // Very lightweight WEBVTT parser to flatten into lines with [start-end] text
  // Example output: [00:00:01.000-00:00:04.000] Hello world
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  const timeRe = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
  while (i < lines.length) {
    const line = lines[i++].trim();
    if (!line) continue;
    const m = timeRe.exec(line);
    if (!m) continue;
    const start = m[1];
    const end = m[2];
    const textLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      i++;
      if (!t) break;
      if (timeRe.test(t)) { i--; break; }
      if (/^WEBVTT/i.test(t)) continue;
      if (/^\d+$/.test(t)) continue; // cue number
      textLines.push(t);
    }
    const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) out.push(`[${start}-${end}] ${text}`);
  }
  return out.join('\n');
}

async function runYtDlp(args: string[] | string, timeoutMs?: number) {
  const argv = Array.isArray(args) ? args : args.split(" ");
  return new Promise<{ ok: boolean; stdout: string; stderr: string; code: number }>((resolve) => {
    const proc = spawn(YT_DLP_BIN, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try { proc.kill(); } catch {}
      }, timeoutMs);
    }
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, stdout, stderr: (stderr ? stderr + "\n" : "") + "yt-dlp timed out", code: code ?? 1 });
      } else {
        resolve({ ok: (code ?? 1) === 0, stdout, stderr, code: code ?? 1 });
      }
    });
    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: String(err), code: 1 });
    });
  });
}
export async function downloadYouTubeVideo(url: string): Promise<{
  ok: boolean;
  videoPath?: string;
  publicUrl?: string;
  metadata?: {
    title: string;
    description: string;
    duration: number | null;
    uploader: string;
    uploadDate: string;
    thumbnailUrl: string;
  };
  error?: string;
}> {
  // Try to get metadata first (ignore any local yt-dlp config)
  const metaRes = await runYtDlp(["--ignore-config", "--no-playlist", "-J", url], 15000);
  let info: any | null = null;
  if (metaRes.ok) {
    try {
      info = JSON.parse(metaRes.stdout);
    } catch {}
  }

  const id = info?.id || `yt_${Date.now()}`;
  const outDir = resolvePath("public", "downloads", "videos", id);
  ensureDir(outDir);
  const outFile = join(outDir, `${id}.mp4`);

  // If already downloaded, return immediately
  if (existsSync(outFile)) {
    const publicUrl = `/downloads/videos/${id}/${id}.mp4`;
    const metadata = {
      title: info?.title ?? "Unknown",
      description: info?.description ?? "",
      duration: info?.duration ?? null,
      uploader: info?.uploader ?? "",
      uploadDate: info?.upload_date ?? "",
      thumbnailUrl: info?.thumbnail ?? ""
    };
    return { ok: true, videoPath: outFile, publicUrl, metadata };
  }

  // Common hardening flags for YouTube to avoid 403s and improve stability
  const common: string[] = [
    "--ignore-config",
    "--no-playlist",
    "-R", "3",
    "--fragment-retries", "10",
    "--force-ipv4",
    "--geo-bypass",
    "--add-header", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "--add-header", "Referer: https://www.youtube.com/",
    "--add-header", "Accept-Language: en-US,en;q=0.9"
  ];
  const cookiesFile = process.env.YTDLP_COOKIES_FILE;
  if (cookiesFile && existsSync(cookiesFile)) {
    common.push("--cookies", cookiesFile);
  }
  const cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER;
  if (!cookiesFile && cookiesFromBrowser) {
    common.push("--cookies-from-browser", cookiesFromBrowser);
  }
  // Force a modern web client by default to avoid "not available on this app" issues
  const ytClient = process.env.YTDLP_YOUTUBE_CLIENT || "web"; // e.g., web, android, tv
  if (ytClient) {
    common.push("--extractor-args", `youtube:player_client=${ytClient}`);
  }

  // Attempt 1: prefer progressive MP4 to reduce fragmented stream issues
  const args1 = [
    ...common,
    "-N", "4",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "--force-overwrites",
    "-o", outFile,
    url
  ];
  if (FFMPEG_BIN) args1.splice( args1.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN );
  const dlTimeoutMs = Number(process.env.YTDLP_TIMEOUT_MS || 90000);
  let dlRes = await runYtDlp(args1, dlTimeoutMs);

  // Attempt 2: fall back to bestvideo+bestaudio merge
  if (!dlRes.ok) {
    const args2 = [
      ...common,
      "-N", "4",
      "-f", "bv*+ba/best",
      "--merge-output-format", "mp4",
      "--force-overwrites",
      "-o", outFile,
      url
    ];
    if (FFMPEG_BIN) args2.splice( args2.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN );
    dlRes = await runYtDlp(args2, dlTimeoutMs);
  }

  // Attempt 3: HLS-only fallback using ffmpeg for HLS, single-connection to avoid 403 on fragments
  if (!dlRes.ok) {
    const args3 = [
      ...common,
      "-N", "1",
      "--hls-prefer-ffmpeg",
      "-f", "b[protocol^=m3u8]/bv*[protocol^=m3u8]+ba/best",
      "--merge-output-format", "mp4",
      "--force-overwrites",
      "-o", outFile,
      url
    ];
    if (FFMPEG_BIN) args3.splice( args3.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN );
    dlRes = await runYtDlp(args3, dlTimeoutMs);
  }

  if (!dlRes.ok) {
    const err = dlRes.stderr || dlRes.stdout || "yt-dlp failed";
    console.warn("[yt-dlp] download failed:", err);
    return { ok: false, error: err };
  }

  const publicUrl = `/downloads/videos/${id}/${id}.mp4`;
  const metadata = {
    title: info?.title ?? "Unknown",
    description: info?.description ?? "",
    duration: info?.duration ?? null,
    uploader: info?.uploader ?? "",
    uploadDate: info?.upload_date ?? "",
    thumbnailUrl: info?.thumbnail ?? ""
  };
  return { ok: true, videoPath: outFile, publicUrl, metadata };
}



export interface VideoProcessingResult {
  results?: string;
  error?: string;
}

export interface SaveUploadedVideoResult {
  absPath: string;
  relPath: string;
  fileName: string;
}

export async function saveUploadedVideo(file: File, courseId: string): Promise<SaveUploadedVideoResult> {
  const uploadsDir = resolvePath("public", "uploads", "videos", courseId);
  await mkdir(uploadsDir, { recursive: true });
  
  const fileExt = file.name.split('.').pop() || 'mp4';
  const fileName = `${randomUUID()}.${fileExt}`;
  const filePath = join(uploadsDir, fileName);
  
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);
  
  return {
    absPath: filePath,
    relPath: `/uploads/videos/${courseId}/${fileName}`,
    fileName
  };
}

export async function processVideo(
  videoSource: string | File,
  processingType: "ai" | "chapter" | "custom" | "transcript",
  customQuery?: string
): Promise<{ results?: string; error?: string; audioPath?: string }> {
  console.log("--- Entering processVideo function ---");
  console.log("[processVideo] videoSource type:", typeof videoSource, "value:", videoSource);
  console.log("[processVideo] processingType:", processingType, "customQuery:", customQuery);

  let videoPath: string;

  if (typeof videoSource === "string") {
    // Check if it's a local file path or a URL
    if (videoSource.startsWith('http') || videoSource.startsWith('www.')) {
      console.log("[processVideo] Handling videoSource as URL.");
      const downloadResult = await downloadYouTubeVideo(videoSource);
      if (!downloadResult.ok || !downloadResult.videoPath) {
        console.error("[processVideo] Failed to download video:", downloadResult.error);
        return { error: downloadResult.error || 'Failed to download video' };
      }
      videoPath = downloadResult.videoPath;
      console.log("[processVideo] Downloaded videoPath:", videoPath);
    } else {
      // Handle local file path
      console.log("[processVideo] Handling videoSource as local file path.");
      if (!existsSync(videoSource)) {
        const errorMsg = `Video file not found at path: ${videoSource}`;
        console.error("[processVideo]", errorMsg);
        return { error: errorMsg };
      }
      videoPath = videoSource;
    }
  } else {
    console.log("[processVideo] Handling videoSource as File (uploaded file).");
    // For File objects, we need to save them to a temporary path
    const tempDir = resolvePath("public", "downloads", "temp");
    ensureDir(tempDir);
    videoPath = join(tempDir, videoSource.name);
    console.log("[processVideo] Attempting to save uploaded file to:", videoPath);
    try {
      const buffer = Buffer.from(await (videoSource as File).arrayBuffer());
      await writeFile(videoPath, buffer);
      console.log("[processVideo] Successfully saved uploaded file.");
    } catch (error) {
      console.error("[processVideo] Failed to write uploaded file:", error);
      return { error: "Failed to save uploaded file" };
    }
  }

  console.log("[processVideo] videoPath before audio extraction:", videoPath);
  const audioPath = videoPath.replace(/\.mp4$/, ".flac");
  console.log("[processVideo] audioPath for FFmpeg:", audioPath);

  const ffmpegArgs = [
    "-i", videoPath,
    "-y",
    "-vn",
    "-acodec", "flac",
    "-ar", "16000",
    audioPath,
  ];
  console.log("[processVideo] FFmpeg arguments:", ffmpegArgs.join(" "));

  const ffmpegResult = await runFfmpeg(ffmpegArgs);
  console.log("[processVideo] FFmpeg result:", ffmpegResult);

  if (!ffmpegResult.ok) {
    console.error("[processVideo] FFmpeg audio extraction failed:", ffmpegResult.stderr);
    return { error: "Failed to extract audio from video" };
  }

  console.log(`[processVideo] Audio extracted to: ${audioPath}`);

  if (processingType === "ai" || processingType === "custom") {
    console.log("[processVideo] Calling getTopicsFromAudio with audioPath:", audioPath);
    const topicsResult = await getTopicsFromAudio(audioPath, "segmentation", customQuery);
    console.log("[processVideo] getTopicsFromAudio returned:", topicsResult);
    if (topicsResult.error) {
      console.error("[processVideo] Gemini processing failed:", topicsResult.error);
      return { error: `Gemini processing failed: ${topicsResult.error}` };
    }
    // Here you would typically save the results to your database
    console.log("[processVideo] Gemini processing successful:", topicsResult.text);
    return { results: topicsResult.text, audioPath };
  } else if (processingType === "transcript") {
    console.log("[processVideo] Calling getTranscriptFromAudio with audioPath:", audioPath);
    const transcriptResult = await getTopicsFromAudio(audioPath, "transcription");
    console.log("[processVideo] getTranscriptFromAudio returned:", transcriptResult);
    if (transcriptResult.error) {
      console.error("[processVideo] Transcription failed:", transcriptResult.error);
      return { error: `Transcription failed: ${transcriptResult.error}` };
    }
    console.log("[processVideo] Transcription successful:", transcriptResult.text);
    return { results: transcriptResult.text, audioPath };
  }

  console.log("[processVideo] Processing type not 'ai' or 'custom'. Returning completed status.");
  return { results: "", audioPath };
}

interface TopicsResult {
  text: string;
  error?: string;
}



export async function extractYouTubeMetadata(url: string) {
  // Ignore any global/local yt-dlp config that could trigger downloads
  const res = await runYtDlp(["--ignore-config", "-s", "-J", url]);
  if (!res.ok) {
    console.warn("[yt-dlp] metadata fetch failed:", res.stderr);
    return null;
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    console.warn("[yt-dlp] JSON parse failed:", e);
    return null;
  }
}

// --- YouTube Data API (v3) helpers for chapters via description timestamps ---
function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    // Standard watch URL
    const v = u.searchParams.get("v");
    if (v) return v;
    // youtu.be short
    if (u.hostname.endsWith("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return id;
    }
    // embed
    if (/youtube\.com$/i.test(u.hostname) && u.pathname.startsWith("/embed/")) {
      const id = u.pathname.split("/")[2];
      if (id) return id;
    }
    // shorts
    if (/youtube\.com$/i.test(u.hostname) && u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      if (id) return id;
    }
  } catch {}
  return null;
}

function iso8601DurationToSeconds(iso?: string | null): number | null {
  if (!iso) return null;
  // PT#H#M#S
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
}

function parseTimestampTokenToSeconds(tok: string): number | null {
  // Accept H:MM:SS, MM:SS, HH:MM:SS(.ms)
  const clean = tok.replace(/[\[\]()]/g, "").trim();
  const parts = clean.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p.split(".")[0] || p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  let h = 0, m = 0, s = 0;
  if (nums.length === 3) {
    [h, m, s] = nums;
  } else {
    [m, s] = nums;
  }
  return h * 3600 + m * 60 + s;
}

function parseDescriptionChapters(description: string): Array<{ title: string; start: number }> {
  const lines = (description || "").split(/\r?\n/);
  const timeRe = /(\[)?\b\d{1,2}:(?:\d{1,2}:)?\d{2}(?:\.\d+)?(\])?/; // 1:23 or 01:02:03
  const entries: Array<{ start: number; title: string }> = [];
  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    const m = raw.match(timeRe);
    if (!m) continue;
    const secs = parseTimestampTokenToSeconds(m[0]);
    if (secs == null) continue;
    const idx = raw.indexOf(m[0]);
    let title = raw.slice(idx + m[0].length).replace(/^[\s\-–—:.]+/, "").trim();
    if (!title) {
      const before = raw.slice(0, idx).trim();
      if (before) title = before;
    }
    entries.push({ start: secs, title: title || `Chapter @ ${m[0]}` });
  }
  entries.sort((a, b) => a.start - b.start);
  return entries;
}

async function getYouTubeChaptersFromApi(url: string): Promise<Array<{ title: string; start_time: number; end_time: number }>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];
  const vid = extractVideoId(url);
  if (!vid) return [];
  try {
    const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(vid)}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const data: any = await res.json();
    const item = data?.items?.[0];
    if (!item) return [];
    const description: string = item?.snippet?.description || "";
    const durationIso: string | null = item?.contentDetails?.duration || null;
    const totalDur = iso8601DurationToSeconds(durationIso);
    const entries = parseDescriptionChapters(description);
    if (entries.length === 0) return [];
    const out: Array<{ title: string; start_time: number; end_time: number }> = [];
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i];
      const next = entries[i + 1];
      const start = Math.max(0, Math.floor(cur.start));
      const end = Math.max(start, Math.floor(next?.start ?? (totalDur ?? start)));
      out.push({ title: cur.title, start_time: start, end_time: end });
    }
    return out;
  } catch {} // Ignore errors, return empty array
  return [];
}

export interface ParsedChapter {
  title: string;
  description: string;
  startTime: number;
  endTime: number;
}

export function parseFormattedChapters(text: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  if (!text) return chapters;

  const lines = text.split(/\r?\n/);
  const chapterRegex = /^\* \*\*(.+?):\*\* (.+)/;

  for (const line of lines) {
    const match = line.trim().match(chapterRegex);
    if (!match) continue;

    const header = match[1];
    const description = match[2].trim();

    // Timestamps can be M:S or H:M:S
    const timeMatch = header.match(/^[\d:.-]+-[\d:.-]+\s+/);
    if (!timeMatch) continue;
    
    const timeRange = timeMatch[0].trim();
    const [startTimeStr, endTimeStr] = timeRange.split('-');

    const title = header.substring(timeMatch[0].length).trim();

    const startTime = parseTimestampTokenToSeconds(startTimeStr);
    const endTime = parseTimestampTokenToSeconds(endTimeStr);

    if (startTime !== null && endTime !== null) {
      chapters.push({
        title,
        description,
        startTime,
        endTime,
      });
    }
  }

  return chapters;
}

// Helper function to parse MM:SS or HH:MM:SS to seconds
function parseTimestampToSeconds(timestamp: string): number | null {
  const parts = timestamp.split(':').map(Number);
  if (parts.some(isNaN)) {
    return null;
  }

  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

export function parseCustomFormattedChapter(text: string): { startTime: number | null; endTime: number | null; title: string; description: string } | null {
  // 1. Remove (Star) and (New Line) tokens
  let cleanedText = text.replace(/\(Star\)/g, '').replace(/\(New Line\)/g, '').trim();

  // 2. Regex to match the pattern: timestamp title:description
  const regex = /^(\d{1,2}:\d{2}-\d{1,2}:\d{2})\s*(.+?):(.+)$/;
  const match = cleanedText.match(regex);

  if (!match) {
    return null;
  }

  const timeRange = match[1];
  const titleWithColon = match[2];
  const description = match[3].trim();

  // Remove the colon from the title
  const title = titleWithColon.replace(/:$/, '').trim();

  // Parse timestamp
  const [startTimeStr, endTimeStr] = timeRange.split('-');
  const startTime = parseTimestampToSeconds(startTimeStr);
const endTime = parseTimestampToSeconds(endTimeStr);

  return { startTime, endTime, title, description };
}

export async function getYouTubeChapters(url: string) {
  // Use only the YouTube Data API (via description timestamps). No yt-dlp fallback.
  // If YOUTUBE_API_KEY is missing or no chapters are present in the description,
  // return an empty list and let the caller decide the fallback UX.
  const apiChapters = await getYouTubeChaptersFromApi(url);
  return apiChapters;
}

export async function getYouTubeTranscriptVtt(url: string): Promise<string | null> {
  const info = await extractYouTubeMetadata(url);
if (!info) return null;
  const preferLangs = (process.env.YT_TRANSCRIPT_LANGS || "en,en-US,en-GB").split(",").map((s) => s.trim()).filter(Boolean);
  const subs: Record<string, any[]> = info?.subtitles || {};
  const auto: Record<string, any[]> = info?.automatic_captions || {};
  const pickTrack = (obj: Record<string, any[]>) => {
    for (const lang of preferLangs) {
      const arr = obj?.[lang];
      if (Array.isArray(arr)) {
        // Prefer vtt
        const vtt = arr.find((t: any) => (t?.ext || t?.format || "").toLowerCase().includes("vtt"));
        if (vtt?.url) return vtt.url as string;
        // else take first available
        if (arr[0]?.url) return arr[0].url as string;
      }
    }
    // fallback: any first
    for (const key of Object.keys(obj)) {
      const arr = obj[key];
      if (Array.isArray(arr) && arr[0]?.url) return arr[0].url as string;
    }
    return null;
  };
  let urlVtt = pickTrack(subs);
  if (!urlVtt) urlVtt = pickTrack(auto);
  if (!urlVtt) return null;
  try {
    const res = await fetch(urlVtt);
    if (!res.ok) return null;
    const text = await res.text();
    return text || null;
  } catch {} // Ignore errors
  return null;
}

export function runFfmpeg(argv: string[]) {
  const bin = FFMPEG_BIN || "ffmpeg";
  return new Promise<{ ok: boolean; stdout: string; stderr: string; code: number }>((resolve) => {
    const proc = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ ok: (code ?? 1) === 0, stdout, stderr, code: code ?? 1 }));
    proc.on("error", (err) => resolve({ ok: false, stdout, stderr: String(err), code: 1 }));
  });
}

export async function clipVideoSegment(
  sourcePath: string,
  startSeconds: number,
  endSeconds: number,
  outPath: string,
  thumbnailOutPath?: string
): Promise<{ ok: boolean; stderr?: string; thumbnail?: boolean; error?: string }> {
  ensureDir(dirname(outPath));
  const start = Math.max(0, Math.floor(startSeconds));
  const end = Math.max(0, Math.floor(endSeconds));
  const duration = Math.max(0, end - start);
  if (!duration) {
    return { ok: false, error: "duration is zero" };
  }
  const args = [
    "-y",
    "-ss",
    String(start),
    "-t",
    String(duration),
    "-i",
    sourcePath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    outPath
  ];
  const res = await runFfmpeg(args);
  let thumbOk = false;
  if (thumbnailOutPath) {
    ensureDir(dirname(thumbnailOutPath));
    const tArgs = [
      "-y",
      "-ss",
      String(Math.max(0, start + Math.floor(duration / 3))),
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      thumbnailOutPath
    ];
    const tRes = await runFfmpeg(tArgs);
    thumbOk = tRes.ok;
  }
  return { ok: res.ok, stderr: res.stderr, thumbnail: thumbOk };
}

export function isPlaylistUrl(url: string) {
  return /[?&]list=/.test(url);
}

export type PlaylistEntry = {
  id: string;
  title: string;
  url: string;
  duration?: number | null;
  uploader?: string | null;
  thumbnailUrl?: string | null;
};

export type PlaylistInfo = {
  id: string;
  title: string;
  entries: PlaylistEntry[];
};

export async function extractYouTubePlaylist(url: string): Promise<PlaylistInfo | null> {
  const info = await extractYouTubeMetadata(url);
  if (!info) return null;
  const playlistId = info?.id || `pl_${Date.now()}`;
  const title = info?.title || "Playlist";
  const entriesRaw = (info?.entries || info?.requested_downloads || []) as any[];
  const entries: PlaylistEntry[] = entriesRaw
    .map((e: any) => {
      const vid = e?.id || e?.video_id || e?.extractor_id || e?.extractor_key;
      const vidUrl = e?.webpage_url || e?.url || (vid ? `https://www.youtube.com/watch?v=${vid}` : null);
      if (!vid || !vidUrl) return null;
      return {
        id: String(vid),
        title: e?.title || "Untitled",
        url: String(vidUrl),
        duration: e?.duration ?? null,
        uploader: e?.uploader ?? null,
        thumbnailUrl: e?.thumbnail ?? (e?.thumbnails?.[0]?.url ?? null)
      } as PlaylistEntry;
    })
    .filter(Boolean) as PlaylistEntry[];

  return { id: String(playlistId), title: String(title), entries };
}

export async function downloadYouTubePlaylist(url: string) {
  const playlist = await extractYouTubePlaylist(url);
  if (!playlist) return { ok: false as const, error: "Failed to fetch playlist metadata" };
  const results: Array<{ id: string; publicUrl?: string; error?: string }> = [];
  for (const entry of playlist.entries) {
    try {
      const res = await downloadYouTubeVideo(entry.url);
      if (!res.ok) {
        results.push({ id: entry.id, error: res.error || "download failed" });
      } else {
        results.push({ id: entry.id, publicUrl: res.publicUrl });
      }
    } catch (e: any) {
      results.push({ id: entry.id, error: e?.message ?? "download failed" });
    }
  }
  return { ok: true as const, playlistId: playlist.id, results };
}
