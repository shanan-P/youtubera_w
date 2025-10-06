// Combined content from video.server.ts and gemini.server.ts, converted to plain JavaScript

// From video.server.ts
const { spawn } = require("node:child_process");
const { existsSync, mkdirSync } = require("node:fs");
const { writeFile } = require("node:fs/promises");
const { dirname, join, resolve: resolvePath } = require("node:path");

const YT_DLP_BIN = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_PATH || "";

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function vttToPlainTextWithTimestamps(vtt) {
  const lines = vtt.split(/\r?\n/);
  const out = [];
  let i = 0;
  const timeRe = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
  while (i < lines.length) {
    const line = lines[i++].trim();
    if (!line) continue;
    const m = timeRe.exec(line);
    if (!m) continue;
    const start = m[1];
    const end = m[2];
    const textLines = [];
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

async function runYtDlp(args, timeoutMs) {
  const argv = Array.isArray(args) ? args : args.split(" ");
  return new Promise((resolve) => {
    const proc = spawn(YT_DLP_BIN, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer = null;
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

async function downloadYouTubeVideo(url) {
  const metaRes = await runYtDlp(["--ignore-config", "--no-playlist", "-J", url], 15000);
  let info = null;
  if (metaRes.ok) {
    try {
      info = JSON.parse(metaRes.stdout);
    } catch {}
  }

  const id = info?.id || `yt_${Date.now()}`;
  const outDir = resolvePath("public", "downloads", "videos", id);
  ensureDir(outDir);
  const outFile = join(outDir, `${id}.mp4`);

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

  const common = [
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
  const ytClient = process.env.YTDLP_YOUTUBE_CLIENT || "web";
  if (ytClient) {
    common.push("--extractor-args", `youtube:player_client=${ytClient}`);
  }

  const args1 = [
    ...common,
    "-N", "8",
    "-f", "best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "--force-overwrites",
    "-o", outFile,
    url
  ];
  if (FFMPEG_BIN) args1.splice( args1.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN );
  const dlTimeoutMs = Number(process.env.YTDLP_TIMEOUT_MS || 90000);
  let dlRes = await runYtDlp(args1, dlTimeoutMs);

  if (!dlRes.ok) {
    const args2 = [
      ...common,
      "-N", "8",
      "-f", "bv*+ba/best",
      "--merge-output-format", "mp4",
      "--force-overwrites",
      "-o", outFile,
      url
    ];
    if (FFMPEG_BIN) args2.splice( args2.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN );
    dlRes = await runYtDlp(args2, dlTimeoutMs);
  }

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

function runFfmpeg(argv) {
  const bin = FFMPEG_BIN || "ffmpeg";
  return new Promise((resolve) => {
    const proc = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ ok: (code ?? 1) === 0, stdout, stderr, code: code ?? 1 }));
    proc.on("error", (err) => resolve({ ok: false, stdout, stderr: String(err), code: 1 }));
  });
}

// From gemini.server.ts
const fs = require('fs/promises'); // Renamed to avoid conflict with node:fs
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash-latest";

if (!GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set. Add it to .env to use Gemini features.");
}

async function getTopicsFromAudio(audioPath, customQuery) {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not configured");
    return { error: "GEMINI_API_KEY is not configured" };
  }

  try {
    const audioBuffer = await fs.readFile(audioPath);

    const uploadUrl = `https://generativelanguage.googleapis.com/v1beta/files?key=${GEMINI_API_KEY}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
      },
      body: JSON.stringify({ file: { displayName: audioPath } }),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Gemini file upload failed:", uploadResponse.status, errorText);
      return { error: "Gemini file upload failed" };
    }

    const uploadResult = await uploadResponse.json();
    const fileUri = uploadResult.file.uri;

    const gcsUploadUrl = uploadResponse.headers.get("X-Goog-Upload-URL");
    if (!gcsUploadUrl) {
      return { error: "Could not get GCS upload URL" };
    }

    await fetch(gcsUploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/flac" },
      body: audioBuffer,
    });

    const prompt = customQuery
      ? `Analyze the following audio and answer the question: ${customQuery}`
      : "Analyze the following audio and provide a detailed list of subtopics with timestamps. Format the output as a markdown list.";

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const generateRequest = {
      contents: [
        {
          parts: [
            { text: prompt },
            { fileData: { mimeType: "audio/flac", fileUri } },
          ],
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    };

    const generateResponse = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generateRequest),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error("Gemini content generation failed:", generateResponse.status, errorText);
      return { error: "Gemini content generation failed" };
    }

    const generateResult = await generateResponse.json();
    const text = generateResult.candidates?.[0]?.content?.parts?.[0]?.text;

    return { text };
  } catch (error) {
    console.error("Error processing audio with Gemini:", error);
    return { error: "An unexpected error occurred during Gemini audio processing." };
  }
}

// The processVideo function from video.server.ts, modified to use the local getTopicsFromAudio
async function processVideo(
  videoSource, // Removed type annotation
  processingType, // Removed type annotation
  customQuery
) {
  console.log("[processVideo]", { videoSource, processingType, customQuery });

  let videoPath;

  if (typeof videoSource === "string") {
    // Assuming videoSource is a local file path, not a YouTube URL
    videoPath = videoSource;
  } else {
    // This branch is for File objects, which we are avoiding for this test
    console.error("File object processing is not supported in this test script.");
    return { error: "File object processing not supported" };
  }

  const audioPath = videoPath.replace(/\.mp4$/, ".flac");

  const ffmpegArgs = [
    "-i", videoPath,
    "-y",
    "-vn",
    "-acodec", "flac",
    "-ar", "16000",
    audioPath,
  ];

  const ffmpegResult = await runFfmpeg(ffmpegArgs);

  if (!ffmpegResult.ok) {
    console.error("FFmpeg audio extraction failed:", ffmpegResult.stderr);
    return { error: "Failed to extract audio from video" };
  }

  console.log(`Audio extracted to: ${audioPath}`);

  if (processingType === "ai" || processingType === "custom") {
    const topicsResult = await getTopicsFromAudio(audioPath, customQuery); // Call local getTopicsFromAudio
    if (topicsResult.error) {
      return { error: `Gemini processing failed: ${topicsResult.error}` };
    }
    console.log("Gemini processing successful:", topicsResult.text);
    return { id: `vp_${Date.now()}`, status: "completed", results: topicsResult.text };
  }

  return { id: `vp_${Date.now()}`, status: "completed" };
}

// Test logic
async function testVideoProcessing() {
  const videoPath = join(process.cwd(), "Building Agents with OpenAI Agent SDK.mp4");
  console.log(`Attempting to process video: ${videoPath}`);

  if (!process.env.FFMPEG_PATH) {
    console.warn("FFMPEG_PATH not set. Ensure ffmpeg is in your system's PATH or set the environment variable.");
  }
  if (!process.env.YTDLP_PATH) {
    console.warn("YTDLP_PATH not set. Ensure yt-dlp is in your system's PATH or set the environment variable.");
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not set. Gemini processing will fail.");
  }

  try {
    const result = await processVideo(videoPath, "ai");
    console.log("Video processing result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error during video processing:", error);
  }
}

testVideoProcessing();
