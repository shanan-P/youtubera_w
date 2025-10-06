"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateShortTitleStub = generateShortTitleStub;
exports.generateShortForEntry = generateShortForEntry;
exports.generateShortsForCourse = generateShortsForCourse;
exports.getShortWithCourse = getShortWithCourse;
const db_server_1 = require("~/utils/db.server");
const video_server_1 = require("~/services/video.server");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
function ensureDir(dir) {
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
}
function publicShortsPaths(shortId) {
    const dir = (0, node_path_1.resolve)("public", "downloads", "shorts", shortId);
    const clipAbs = (0, node_path_1.join)(dir, "clip.mp4");
    const thumbAbs = (0, node_path_1.join)(dir, "thumb.jpg");
    const clipUrl = `/downloads/shorts/${shortId}/clip.mp4`;
    const thumbUrl = `/downloads/shorts/${shortId}/thumb.jpg`;
    return { dir, clipAbs, thumbAbs, clipUrl, thumbUrl };
}
function isPublicDownloadsPath(url) {
    return url.startsWith("/downloads/");
}
function localPathFromPublicUrl(url) {
    // Map a public URL like /downloads/videos/<id>/<file> to absolute path in public/
    return (0, node_path_1.resolve)("public", url.replace(/^\/+/, ""));
}
function generateShortTitleStub(originalTitle) {
    const base = originalTitle?.trim() || "Short Clip";
    return base.length > 80 ? `${base.slice(0, 77)}...` : base;
}
async function generateShortForEntry(shortId) {
    const short = await db_server_1.prisma.shortVideo.findUnique({
        where: { id: shortId },
        include: {
            chapter: {
                include: { course: true }
            }
        }
    });
    if (!short)
        return { ok: false, error: "ShortVideo not found" };
    if (short.startTime == null || short.endTime == null) {
        return { ok: false, error: "ShortVideo missing start/end time" };
    }
    if (!short.videoUrl) {
        return { ok: false, error: "ShortVideo missing videoUrl" };
    }
    // Ensure we have a local source video path
    let sourcePath = null;
    if (isPublicDownloadsPath(short.videoUrl)) {
        sourcePath = localPathFromPublicUrl(short.videoUrl);
    }
    else {
        // Assume YouTube URL or remote URL handled by yt-dlp
        const dl = await (0, video_server_1.downloadYouTubeVideo)(short.videoUrl);
        if (!dl.ok || !dl.videoPath) {
            const advice = "; try again later or set YTDLP_COOKIES_FILE to a browser-exported cookies.txt if the video requires cookies";
            return { ok: false, error: (dl.error || "Failed to download source video") + advice };
        }
        sourcePath = dl.videoPath;
        // Persist local playback URL for this chapter so future previews use the local <video>
        // instead of falling back to a YouTube embed. We update any ShortVideo in the same
        // chapter that still points at the original remote URL.
        try {
            if (dl.publicUrl && short.chapterId && short.videoUrl) {
                await db_server_1.prisma.shortVideo.updateMany({
                    where: { chapterId: short.chapterId, videoUrl: short.videoUrl },
                    data: { videoUrl: dl.publicUrl }
                });
            }
        }
        catch (e) {
            // Non-fatal: continue even if we cannot persist the local URL
            console.warn("[shorts] failed to persist local source URL:", e);
        }
    }
    const { dir, clipAbs, thumbAbs, clipUrl, thumbUrl } = publicShortsPaths(short.id);
    ensureDir(dir);
    const res = await (0, video_server_1.clipVideoSegment)(sourcePath, Math.max(0, Math.floor(short.startTime)), Math.max(0, Math.floor(short.endTime)), clipAbs, thumbAbs);
    if (!res.ok) {
        return { ok: false, error: res.error || res.stderr || "ffmpeg failed" };
    }
    // Update DB with URLs
    const updated = await db_server_1.prisma.shortVideo.update({
        where: { id: short.id },
        data: {
            downloadUrl: clipUrl,
            thumbnailUrl: res.thumbnail ? thumbUrl : short.thumbnailUrl,
            // fill duration if missing
            duration: short.duration != null
                ? short.duration
                : Math.max(0, Math.floor(short.endTime) - Math.max(0, Math.floor(short.startTime)))
        }
    });
    // Optional: export a local copy to user-defined directory
    try {
        const exportDir = ([
            "short_export_dir",
            "SHORT_EXPORT_DIR",
            "SHORTS_EXPORT_DIR"
        ]
            .map((k) => process.env[k] || "")
            .find((v) => v && v.trim().length > 0) || "").trim();
        if (exportDir) {
            ensureDir(exportDir);
            const safe = (s) => s
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // remove invalid Win chars
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 80);
            const courseTitle = safe(short.chapter?.course?.title || "Course");
            const shortTitle = safe(short.title || updated.id);
            const baseName = `${courseTitle} - ${shortTitle}`.replace(/[ .]+$/g, "");
            const destMp4 = (0, node_path_1.join)(exportDir, `${baseName || updated.id}.mp4`);
            (0, node_fs_1.copyFileSync)(clipAbs, destMp4);
            if (res.thumbnail) {
                const destJpg = (0, node_path_1.join)(exportDir, `${baseName || updated.id}.jpg`);
                try {
                    (0, node_fs_1.copyFileSync)(thumbAbs, destJpg);
                }
                catch { }
            }
        }
    }
    catch (e) {
        // Do not fail generation if export copy fails; log and continue
        console.warn("[shorts] export copy failed:", e);
    }
    return { ok: true, shortId: updated.id, downloadUrl: updated.downloadUrl, thumbnailUrl: updated.thumbnailUrl };
}
async function generateShortsForCourse(courseId, maxCount = 10) {
    const shorts = await db_server_1.prisma.shortVideo.findMany({
        where: { chapter: { courseId } },
        orderBy: [{ orderIndex: "asc" }]
    });
    const candidates = shorts.filter((s) => s.startTime != null && s.endTime != null && !s.downloadUrl);
    const limited = candidates.slice(0, maxCount);
    const results = [];
    for (const s of limited) {
        const r = await generateShortForEntry(s.id);
        results.push({ id: s.id, ok: r.ok, error: r.error, downloadUrl: r.downloadUrl });
    }
    return { ok: true, generated: results };
}
async function getShortWithCourse(shortId) {
    return db_server_1.prisma.shortVideo.findUnique({
        where: { id: shortId },
        include: {
            chapter: {
                include: {
                    course: true
                }
            }
        }
    });
}
