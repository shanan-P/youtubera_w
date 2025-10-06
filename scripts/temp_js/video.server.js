"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vttToPlainTextWithTimestamps = vttToPlainTextWithTimestamps;
exports.downloadYouTubeVideo = downloadYouTubeVideo;
exports.processVideo = processVideo;
exports.extractYouTubeMetadata = extractYouTubeMetadata;
exports.getYouTubeChapters = getYouTubeChapters;
exports.getYouTubeTranscriptVtt = getYouTubeTranscriptVtt;
exports.runFfmpeg = runFfmpeg;
exports.clipVideoSegment = clipVideoSegment;
exports.isPlaylistUrl = isPlaylistUrl;
exports.extractYouTubePlaylist = extractYouTubePlaylist;
exports.downloadYouTubePlaylist = downloadYouTubePlaylist;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
// Video processing service utils + minimal yt-dlp integration per `design.md`
const YT_DLP_BIN = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_BIN = process.env.FFMPEG_PATH || "";
function ensureDir(dir) {
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
}
function vttToPlainTextWithTimestamps(vtt) {
    // Very lightweight WEBVTT parser to flatten into lines with [start-end] text
    // Example output: [00:00:01.000-00:00:04.000] Hello world
    const lines = vtt.split(/\r?\n/);
    const out = [];
    let i = 0;
    const timeRe = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;
    while (i < lines.length) {
        const line = lines[i++].trim();
        if (!line)
            continue;
        const m = timeRe.exec(line);
        if (!m)
            continue;
        const start = m[1];
        const end = m[2];
        const textLines = [];
        while (i < lines.length) {
            const t = lines[i].trim();
            i++;
            if (!t)
                break;
            if (timeRe.test(t)) {
                i--;
                break;
            }
            if (/^WEBVTT/i.test(t))
                continue;
            if (/^\d+$/.test(t))
                continue; // cue number
            textLines.push(t);
        }
        const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
        if (text)
            out.push(`[${start}-${end}] ${text}`);
    }
    return out.join('\n');
}
async function runYtDlp(args, timeoutMs) {
    const argv = Array.isArray(args) ? args : args.split(" ");
    return new Promise((resolve) => {
        const proc = (0, node_child_process_1.spawn)(YT_DLP_BIN, argv, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let timer = null;
        if (timeoutMs && timeoutMs > 0) {
            timer = setTimeout(() => {
                timedOut = true;
                try {
                    proc.kill();
                }
                catch { }
            }, timeoutMs);
        }
        proc.stdout.on("data", (d) => (stdout += d.toString()));
        proc.stderr.on("data", (d) => (stderr += d.toString()));
        proc.on("close", (code) => {
            if (timer)
                clearTimeout(timer);
            if (timedOut) {
                resolve({ ok: false, stdout, stderr: (stderr ? stderr + "\n" : "") + "yt-dlp timed out", code: code ?? 1 });
            }
            else {
                resolve({ ok: (code ?? 1) === 0, stdout, stderr, code: code ?? 1 });
            }
        });
        proc.on("error", (err) => {
            if (timer)
                clearTimeout(timer);
            resolve({ ok: false, stdout, stderr: String(err), code: 1 });
        });
    });
}
async function downloadYouTubeVideo(url) {
    // Try to get metadata first (ignore any local yt-dlp config)
    const metaRes = await runYtDlp(["--ignore-config", "--no-playlist", "-J", url], 15000);
    let info = null;
    if (metaRes.ok) {
        try {
            info = JSON.parse(metaRes.stdout);
        }
        catch { }
    }
    const id = info?.id || `yt_${Date.now()}`;
    const outDir = (0, node_path_1.resolve)("public", "downloads", "videos", id);
    ensureDir(outDir);
    const outFile = (0, node_path_1.join)(outDir, `${id}.mp4`);
    // If already downloaded, return immediately
    if ((0, node_fs_1.existsSync)(outFile)) {
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
    if (cookiesFile && (0, node_fs_1.existsSync)(cookiesFile)) {
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
        "-N", "8",
        "-f", "best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "--force-overwrites",
        "-o", outFile,
        url
    ];
    if (FFMPEG_BIN)
        args1.splice(args1.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN);
    const dlTimeoutMs = Number(process.env.YTDLP_TIMEOUT_MS || 90000);
    let dlRes = await runYtDlp(args1, dlTimeoutMs);
    // Attempt 2: fall back to bestvideo+bestaudio merge
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
        if (FFMPEG_BIN)
            args2.splice(args2.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN);
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
        if (FFMPEG_BIN)
            args3.splice(args3.length - 2, 0, "--ffmpeg-location", FFMPEG_BIN);
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
const gemini_server_1 = require("./gemini.server");
async function processVideo(videoSource, processingType, customQuery) {
    console.log("[processVideo]", { videoSource, processingType, customQuery });
    let videoPath;
    if (typeof videoSource === "string") {
        const downloadResult = await downloadYouTubeVideo(videoSource);
        if (!downloadResult.ok || !downloadResult.videoPath) {
            return { error: "Failed to download video" };
        }
        videoPath = downloadResult.videoPath;
    }
    else {
        // For File objects, we need to save them to a temporary path
        const tempDir = (0, node_path_1.resolve)("public", "downloads", "temp");
        ensureDir(tempDir);
        videoPath = (0, node_path_1.join)(tempDir, videoSource.name);
        try {
            const buffer = Buffer.from(await videoSource.arrayBuffer());
            await (0, promises_1.writeFile)(videoPath, buffer);
        }
        catch (error) {
            console.error("Failed to write uploaded file:", error);
            return { error: "Failed to save uploaded file" };
        }
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
        const topicsResult = await (0, gemini_server_1.getTopicsFromAudio)(audioPath, customQuery);
        if (topicsResult.error) {
            return { error: `Gemini processing failed: ${topicsResult.error}` };
        }
        // Here you would typically save the results to your database
        console.log("Gemini processing successful:", topicsResult.text);
        return { id: `vp_${Date.now()}`, status: "completed", results: topicsResult.text };
    }
    return { id: `vp_${Date.now()}`, status: "completed" };
}
async function extractYouTubeMetadata(url) {
    // Ignore any global/local yt-dlp config that could trigger downloads
    const res = await runYtDlp(["--ignore-config", "-s", "-J", url]);
    if (!res.ok) {
        console.warn("[yt-dlp] metadata fetch failed:", res.stderr);
        return null;
    }
    try {
        return JSON.parse(res.stdout);
    }
    catch (e) {
        console.warn("[yt-dlp] JSON parse failed:", e);
        return null;
    }
}
// --- YouTube Data API (v3) helpers for chapters via description timestamps ---
function extractVideoId(url) {
    try {
        const u = new URL(url);
        // Standard watch URL
        const v = u.searchParams.get("v");
        if (v)
            return v;
        // youtu.be short
        if (u.hostname.endsWith("youtu.be")) {
            const id = u.pathname.split("/").filter(Boolean)[0];
            if (id)
                return id;
        }
        // embed
        if (/youtube\.com$/i.test(u.hostname) && u.pathname.startsWith("/embed/")) {
            const id = u.pathname.split("/")[2];
            if (id)
                return id;
        }
        // shorts
        if (/youtube\.com$/i.test(u.hostname) && u.pathname.startsWith("/shorts/")) {
            const id = u.pathname.split("/")[2];
            if (id)
                return id;
        }
    }
    catch { }
    return null;
}
function iso8601DurationToSeconds(iso) {
    if (!iso)
        return null;
    // PT#H#M#S
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
    if (!m)
        return null;
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    const s = Number(m[3] || 0);
    return h * 3600 + min * 60 + s;
}
function parseTimestampTokenToSeconds(tok) {
    // Accept H:MM:SS, MM:SS, HH:MM:SS(.ms)
    const clean = tok.replace(/[\[\]()]/g, "").trim();
    const parts = clean.split(":").map((p) => p.trim());
    if (parts.length < 2 || parts.length > 3)
        return null;
    const nums = parts.map((p) => Number(p.split(".")[0] || p));
    if (nums.some((n) => Number.isNaN(n)))
        return null;
    let h = 0, m = 0, s = 0;
    if (nums.length === 3) {
        [h, m, s] = nums;
    }
    else {
        [m, s] = nums;
    }
    return h * 3600 + m * 60 + s;
}
function parseDescriptionChapters(description) {
    const lines = (description || "").split(/\r?\n/);
    const timeRe = /(\[)?\b\d{1,2}:(?:\d{1,2}:)?\d{2}(?:\.\d+)?(\])?/; // 1:23 or 01:02:03
    const entries = [];
    for (const raw of lines) {
        if (!raw || !raw.trim())
            continue;
        const m = raw.match(timeRe);
        if (!m)
            continue;
        const secs = parseTimestampTokenToSeconds(m[0]);
        if (secs == null)
            continue;
        const idx = raw.indexOf(m[0]);
        let title = raw.slice(idx + m[0].length).replace(/^[\s\-–—:.]+/, "").trim();
        if (!title) {
            const before = raw.slice(0, idx).trim();
            if (before)
                title = before;
        }
        entries.push({ start: secs, title: title || `Chapter @ ${m[0]}` });
    }
    entries.sort((a, b) => a.start - b.start);
    return entries;
}
async function getYouTubeChaptersFromApi(url) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey)
        return [];
    const vid = extractVideoId(url);
    if (!vid)
        return [];
    try {
        const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(vid)}&key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(endpoint);
        if (!res.ok)
            return [];
        const data = await res.json();
        const item = data?.items?.[0];
        if (!item)
            return [];
        const description = item?.snippet?.description || "";
        const durationIso = item?.contentDetails?.duration || null;
        const totalDur = iso8601DurationToSeconds(durationIso);
        const entries = parseDescriptionChapters(description);
        if (entries.length === 0)
            return [];
        const out = [];
        for (let i = 0; i < entries.length; i++) {
            const cur = entries[i];
            const next = entries[i + 1];
            const start = Math.max(0, Math.floor(cur.start));
            const end = Math.max(start, Math.floor(next?.start ?? (totalDur ?? start)));
            out.push({ title: cur.title, start_time: start, end_time: end });
        }
        return out;
    }
    catch {
        return [];
    }
}
async function getYouTubeChapters(url) {
    // Use only the YouTube Data API (via description timestamps). No yt-dlp fallback.
    // If YOUTUBE_API_KEY is missing or no chapters are present in the description,
    // return an empty list and let the caller decide the fallback UX.
    const apiChapters = await getYouTubeChaptersFromApi(url);
    return apiChapters;
}
async function getYouTubeTranscriptVtt(url) {
    const info = await extractYouTubeMetadata(url);
    if (!info)
        return null;
    const preferLangs = (process.env.YT_TRANSCRIPT_LANGS || "en,en-US,en-GB").split(",").map((s) => s.trim()).filter(Boolean);
    const subs = info?.subtitles || {};
    const auto = info?.automatic_captions || {};
    const pickTrack = (obj) => {
        for (const lang of preferLangs) {
            const arr = obj?.[lang];
            if (Array.isArray(arr)) {
                // Prefer vtt
                const vtt = arr.find((t) => (t?.ext || t?.format || "").toLowerCase().includes("vtt"));
                if (vtt?.url)
                    return vtt.url;
                // else take first available
                if (arr[0]?.url)
                    return arr[0].url;
            }
        }
        // fallback: any first
        for (const key of Object.keys(obj)) {
            const arr = obj[key];
            if (Array.isArray(arr) && arr[0]?.url)
                return arr[0].url;
        }
        return null;
    };
    let urlVtt = pickTrack(subs);
    if (!urlVtt)
        urlVtt = pickTrack(auto);
    if (!urlVtt)
        return null;
    try {
        const res = await fetch(urlVtt);
        if (!res.ok)
            return null;
        const text = await res.text();
        return text || null;
    }
    catch {
        return null;
    }
}
function runFfmpeg(argv) {
    const bin = FFMPEG_BIN || "ffmpeg";
    return new Promise((resolve) => {
        const proc = (0, node_child_process_1.spawn)(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => (stdout += d.toString()));
        proc.stderr.on("data", (d) => (stderr += d.toString()));
        proc.on("close", (code) => resolve({ ok: (code ?? 1) === 0, stdout, stderr, code: code ?? 1 }));
        proc.on("error", (err) => resolve({ ok: false, stdout, stderr: String(err), code: 1 }));
    });
}
async function clipVideoSegment(sourcePath, startSeconds, endSeconds, outPath, thumbnailOutPath) {
    ensureDir((0, node_path_1.dirname)(outPath));
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
        ensureDir((0, node_path_1.dirname)(thumbnailOutPath));
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
function isPlaylistUrl(url) {
    return /[?&]list=/.test(url);
}
async function extractYouTubePlaylist(url) {
    const info = await extractYouTubeMetadata(url);
    if (!info)
        return null;
    const playlistId = info?.id || `pl_${Date.now()}`;
    const title = info?.title || "Playlist";
    const entriesRaw = (info?.entries || info?.requested_downloads || []);
    const entries = entriesRaw
        .map((e) => {
        const vid = e?.id || e?.video_id || e?.extractor_id || e?.extractor_key;
        const vidUrl = e?.webpage_url || e?.url || (vid ? `https://www.youtube.com/watch?v=${vid}` : null);
        if (!vid || !vidUrl)
            return null;
        return {
            id: String(vid),
            title: e?.title || "Untitled",
            url: String(vidUrl),
            duration: e?.duration ?? null,
            uploader: e?.uploader ?? null,
            thumbnailUrl: e?.thumbnail ?? (e?.thumbnails?.[0]?.url ?? null)
        };
    })
        .filter(Boolean);
    return { id: String(playlistId), title: String(title), entries };
}
async function downloadYouTubePlaylist(url) {
    const playlist = await extractYouTubePlaylist(url);
    if (!playlist)
        return { ok: false, error: "Failed to fetch playlist metadata" };
    const results = [];
    for (const entry of playlist.entries) {
        try {
            const res = await downloadYouTubeVideo(entry.url);
            if (!res.ok) {
                results.push({ id: entry.id, error: res.error || "download failed" });
            }
            else {
                results.push({ id: entry.id, publicUrl: res.publicUrl });
            }
        }
        catch (e) {
            results.push({ id: entry.id, error: e?.message ?? "download failed" });
        }
    }
    return { ok: true, playlistId: playlist.id, results };
}
