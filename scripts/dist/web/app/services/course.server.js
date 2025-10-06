"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCourseFromSource = createCourseFromSource;
exports.createCourse = createCourse;
exports.getCourseById = getCourseById;
exports.listCourses = listCourses;
exports.updateCourse = updateCourse;
exports.deleteCourse = deleteCourse;
exports.parseTimestampSummary = parseTimestampSummary;
const db_server_1 = require("~/utils/db.server");
const video_server_1 = require("./video.server");
const pdf_server_1 = require("../services/pdf.server");
const adobe_extract_server_1 = require("../services/adobe-extract.server");
async function createCourseFromSource(source, userId) {
    // NOTE: This is a stub that simulates job creation as per `design.md` and `tasks.md`.
    // Real implementation will enqueue a job (Bull) and call video/pdf services.
    const jobId = `job_${Date.now()}`;
    switch (source.type) {
        case "youtube":
            {
                const isPl = (0, video_server_1.isPlaylistUrl)(source.url);
                try {
                    if (isPl) {
                        const pl = await (0, video_server_1.extractYouTubePlaylist)(source.url);
                        const title = pl?.title || "YouTube Playlist";
                        const thumb = pl?.entries?.[0]?.thumbnailUrl || null;
                        const uploader = pl?.entries?.[0]?.uploader || null;
                        const totalDur = pl?.entries?.reduce((sum, e) => sum + (e.duration ?? 0), 0) ?? null;
                        const created = await createCourse({
                            title,
                            contentType: "youtube_playlist",
                            description: pl ? `Playlist with ${pl.entries.length} videos` : "YouTube Playlist",
                            youtuberName: uploader,
                            channelName: uploader,
                            thumbnailUrl: thumb,
                            sourceUrl: source.url,
                            totalDuration: totalDur ? Math.round(totalDur) : null,
                            createdById: userId
                        });
                        // Create one chapter per playlist video (skeleton)
                        if (pl && pl.entries.length > 0) {
                            let idx = 0;
                            for (const entry of pl.entries) {
                                await db_server_1.prisma.chapter.create({
                                    data: {
                                        courseId: created.id,
                                        title: entry.title || `Video ${idx + 1}`,
                                        contentType: "video",
                                        originalContentId: entry.id ?? undefined,
                                        orderIndex: idx++
                                    }
                                });
                            }
                        }
                        return { jobId, courseId: created.id };
                    }
                    else {
                        const info = await (0, video_server_1.extractYouTubeMetadata)(source.url);
                        const title = info?.title || "YouTube Video";
                        const thumb = info?.thumbnail || info?.thumbnails?.[0]?.url || null;
                        const duration = info?.duration ?? null;
                        const uploader = info?.uploader ?? null;
                        const channel = info?.channel ?? null;
                        const description = info?.description ?? null;
                        if (source.segmentation === "chapter") {
                            // Strict: require chapters to exist (from YouTube Data API). Do not create a course otherwise.
                            const chapters = await (0, video_server_1.getYouTubeChapters)(source.url);
                            if (!chapters || chapters.length === 0) {
                                return { jobId, noChapters: true };
                            }
                            const created = await createCourse({
                                title,
                                contentType: "youtube_video",
                                description,
                                youtuberName: uploader,
                                channelName: channel,
                                thumbnailUrl: thumb,
                                sourceUrl: source.url,
                                totalDuration: duration ? Math.round(duration) : null,
                                createdById: userId
                            });
                            const parent = await db_server_1.prisma.chapter.create({
                                data: {
                                    courseId: created.id,
                                    title: "Chapters",
                                    contentType: "video",
                                    orderIndex: 0
                                }
                            });
                            let idx = 0;
                            for (const ch of chapters) {
                                const start = Math.max(0, Math.floor(Number(ch.start_time ?? 0)));
                                const end = Math.max(0, Math.floor(Number(ch.end_time ?? 0)));
                                const segDuration = end > start ? end - start : null;
                                await db_server_1.prisma.shortVideo.create({
                                    data: {
                                        chapterId: parent.id,
                                        title: ch.title || `Chapter ${idx + 1}`,
                                        duration: segDuration,
                                        videoUrl: created.sourceUrl || source.url,
                                        thumbnailUrl: thumb || undefined,
                                        startTime: start,
                                        endTime: end,
                                        processingType: "chapter",
                                        orderIndex: idx++
                                    }
                                });
                            }
                            return { jobId, courseId: created.id };
                        }
                        else if (source.segmentation === "manual") {
                            const created = await createCourse({
                                title,
                                contentType: "youtube_video",
                                description,
                                youtuberName: uploader,
                                channelName: channel,
                                thumbnailUrl: thumb,
                                sourceUrl: source.url,
                                totalDuration: duration ? Math.round(duration) : null,
                                createdById: userId
                            });
                            // Manual segmentation: parse pasted timestamp summary and create Chapters/ShortVideos
                            const manualText = (source.timestampsText || "").trim();
                            const totalDur = duration ? Math.max(0, Math.floor(duration)) : null;
                            const parsed = parseTimestampSummary(manualText);
                            if (!parsed || parsed.groups.length === 0) {
                                // Fallback: single full-video segment if nothing could be parsed
                                const parent = await db_server_1.prisma.chapter.create({
                                    data: {
                                        courseId: created.id,
                                        title: "Manual Segments",
                                        contentType: "video",
                                        orderIndex: 0
                                    }
                                });
                                await db_server_1.prisma.shortVideo.create({
                                    data: {
                                        chapterId: parent.id,
                                        title: "Full Video",
                                        duration: totalDur,
                                        videoUrl: created.sourceUrl || source.url,
                                        thumbnailUrl: thumb || undefined,
                                        startTime: 0,
                                        endTime: totalDur ?? 0,
                                        processingType: "custom",
                                        orderIndex: 0
                                    }
                                });
                            }
                            else {
                                // Create chapters for each top-level group
                                let chIdx = 0;
                                for (let gIdx = 0; gIdx < parsed.groups.length; gIdx++) {
                                    const group = parsed.groups[gIdx];
                                    const nextGroupStart = parsed.groups[gIdx + 1]?.firstStart ?? null;
                                    const chapter = await db_server_1.prisma.chapter.create({
                                        data: {
                                            courseId: created.id,
                                            title: group.title || `Topic ${gIdx + 1}`,
                                            contentType: "video",
                                            orderIndex: chIdx++
                                        }
                                    });
                                    // If group has no items, treat group itself as a single segment (preserve any description)
                                    const items = group.items.length > 0
                                        ? group.items
                                        : [{ title: group.title || `Topic ${gIdx + 1}`, start: group.firstStart ?? 0, desc: group.desc }];
                                    // Compute end times for items within the group
                                    for (let i = 0; i < items.length; i++) {
                                        const it = items[i];
                                        const nextStart = items[i + 1]?.start ?? nextGroupStart ?? totalDur ?? (it.start + 60);
                                        const start = Math.max(0, Math.floor(it.start));
                                        const end = Math.max(start, Math.floor(nextStart));
                                        const segDuration = end > start ? end - start : null;
                                        await db_server_1.prisma.shortVideo.create({
                                            data: {
                                                chapterId: chapter.id,
                                                title: it.title || `Segment ${i + 1}`,
                                                duration: segDuration,
                                                videoUrl: created.sourceUrl || source.url,
                                                thumbnailUrl: thumb || undefined,
                                                startTime: start,
                                                endTime: end,
                                                processingType: "custom", // mark as user-provided
                                                customQuery: it.desc ? String(it.desc).trim() : null,
                                                orderIndex: i
                                            }
                                        });
                                    }
                                }
                            }
                            return { jobId, courseId: created.id };
                        }
                        // Default return if branch conditions change in the future
                        return { jobId };
                    }
                }
                catch (e) {
                    console.warn("[createCourseFromSource] YouTube metadata failed:", e);
                    // In strict chapter-based mode, do NOT create any fallback course.
                    if (!isPl && source.segmentation === "chapter") {
                        return { jobId, noChapters: true };
                    }
                    const created = await createCourse({
                        title: isPl ? "YouTube Playlist Course" : "YouTube Video Course",
                        contentType: (isPl ? "youtube_playlist" : "youtube_video"),
                        description: "Created from YouTube URL (fallback)",
                        sourceUrl: source.url,
                        createdById: userId
                    });
                    return { jobId, courseId: created.id };
                }
            }
            break;
        case "pdf_url": {
            // Create a course from a URL and persist the text content locally.
            const url = source.url;
            const fallbackTitle = decodeURIComponent((url.split("/").pop() || "Article").replace(/\.[^/.]+$/, "")) || "Article Course";
            const created = await createCourse({
                title: fallbackTitle,
                contentType: "pdf_textbook",
                sourceUrl: url,
                createdById: userId
            });
            try {
                const saveResult = await (0, pdf_server_1.saveTxtFromUrl)(url, created.id);
                const courseFilePath = saveResult.relPath;
                const courseTextContent = saveResult.content;
                // Update course with extracted text and file path
                await updateCourse(created.id, {
                    filePath: courseFilePath,
                    textContent: courseTextContent,
                });
                return { jobId, courseId: created.id };
            }
            catch (e) {
                console.warn("[createCourseFromSource] URL processing failed:", e);
                return {
                    jobId,
                    courseId: created.id,
                    error: e instanceof Error ? e.message : "Failed to process URL"
                };
            }
        }
        case "file": {
            const file = source.file;
            const isPdf = file.type === 'application/pdf';
            const isVideo = file.type.startsWith('video/');
            const created = await createCourse({
                title: file.name,
                contentType: isPdf ? 'pdf_textbook' : 'uploaded_video',
                createdById: userId
            });
            try {
                if (isPdf) {
                    const { absPath, relPath: savedRelPath } = await (0, pdf_server_1.saveUploadedPdf)(file, created.id);
                    const relPath = savedRelPath;
                    // Try Adobe's extraction
                    let extractionResult;
                    try {
                        extractionResult = await (0, adobe_extract_server_1.extractTextFromPdfWithAdobe)(absPath);
                    }
                    catch (extractError) {
                        console.warn("[createCourseFromSource] Adobe extraction failed:", extractError);
                        // Continue with empty text content since Adobe extraction failed
                        extractionResult = { text: "" };
                    }
                    // Update course with extracted text and file path
                    await updateCourse(created.id, {
                        filePath: relPath,
                        textContent: extractionResult.text || "",
                    });
                }
                else if (isVideo) {
                    console.log("[createCourseFromSource] Processing video file.");
                    // Process the video with AI to extract topics
                    const { processVideo, saveUploadedVideo } = await Promise.resolve().then(() => __importStar(require('./video.server')));
                    const saveResult = await saveUploadedVideo(file, created.id);
                    const relPath = saveResult.relPath;
                    console.log("[createCourseFromSource] Starting video processing");
                    const result = await processVideo(file, "ai");
                    console.log("[createCourseFromSource] Video processing completed:", result);
                    const parsed = parseTimestampSummary(result.results || "");
                    if (!parsed || parsed.groups.length === 0) {
                        // Fallback: single full-video segment if nothing could be parsed
                        const parent = await db_server_1.prisma.chapter.create({
                            data: {
                                courseId: created.id,
                                title: "Manual Segments",
                                contentType: "video",
                                orderIndex: 0
                            }
                        });
                        await db_server_1.prisma.shortVideo.create({
                            data: {
                                chapterId: parent.id,
                                title: "Full Video",
                                duration: null,
                                videoUrl: relPath,
                                thumbnailUrl: undefined,
                                startTime: 0,
                                endTime: 0,
                                processingType: "custom",
                                orderIndex: 0
                            }
                        });
                    }
                    else {
                        // Create chapters for each top-level group
                        let chIdx = 0;
                        for (let gIdx = 0; gIdx < parsed.groups.length; gIdx++) {
                            const group = parsed.groups[gIdx];
                            const nextGroupStart = parsed.groups[gIdx + 1]?.firstStart ?? null;
                            const chapter = await db_server_1.prisma.chapter.create({
                                data: {
                                    courseId: created.id,
                                    title: group.title || `Topic ${gIdx + 1}`,
                                    contentType: "video",
                                    orderIndex: chIdx++
                                }
                            });
                            // If group has no items, treat group itself as a single segment (preserve any description)
                            const items = group.items.length > 0
                                ? group.items
                                : [{ title: group.title || `Topic ${gIdx + 1}`, start: group.firstStart ?? 0, desc: group.desc }];
                            // Compute end times for items within the group
                            for (let i = 0; i < items.length; i++) {
                                const it = items[i];
                                const nextStart = items[i + 1]?.start ?? nextGroupStart ?? (it.start + 60);
                                const start = Math.max(0, Math.floor(it.start));
                                const end = Math.max(start, Math.floor(nextStart));
                                const segDuration = end > start ? end - start : null;
                                await db_server_1.prisma.shortVideo.create({
                                    data: {
                                        chapterId: chapter.id,
                                        title: it.title || `Segment ${i + 1}`,
                                        duration: segDuration,
                                        videoUrl: relPath,
                                        thumbnailUrl: undefined,
                                        startTime: start,
                                        endTime: end,
                                        processingType: "custom", // mark as user-provided
                                        customQuery: it.desc ? String(it.desc).trim() : null,
                                        orderIndex: i
                                    }
                                });
                            }
                        }
                    }
                    // Update course with processing results
                    await updateCourse(created.id, {
                        filePath: relPath,
                        processingType: 'ai',
                        textContent: result.results || ""
                    });
                }
                return { jobId, courseId: created.id };
            }
            catch (e) {
                console.warn("[createCourseFromSource] File processing failed:", e);
                return {
                    jobId,
                    courseId: created.id,
                    error: e instanceof Error ? e.message : "Failed to process uploaded file"
                };
            }
        }
        default:
            return { jobId, error: `Unsupported source type: ${source.type}` };
    }
}
;
async function createCourse(data) {
    return db_server_1.prisma.course.create({ data });
}
async function getCourseById(id) {
    return db_server_1.prisma.course.findUnique({
        where: { id },
        include: {
            chapters: {
                orderBy: { orderIndex: "asc" },
                include: {
                    shortVideos: { orderBy: { orderIndex: "asc" } },
                    textSections: { orderBy: { orderIndex: "asc" } }
                }
            },
            posts: true,
            formattedVersions: true
        }
    });
}
async function listCourses() {
    return db_server_1.prisma.course.findMany({ orderBy: { createdAt: "desc" } });
}
async function updateCourse(id, data) {
    return db_server_1.prisma.course.update({ where: { id }, data });
}
async function deleteCourse(id) {
    return db_server_1.prisma.course.delete({ where: { id } });
}
function parseTimestampToSeconds(token) {
    // Accept formats like HH:MM:SS(.ms), H:MM:SS, MM:SS, M:SS
    const clean = token.replace(/[\[\]()]/g, "").trim();
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
function parseTimestampSummary(text) {
    const linesRaw = (text || "").split(/\r?\n/);
    // matches [MM:SS], MM:SS, [H:MM:SS], H:MM:SS with optional milliseconds
    const timeRe = /(\[)?\b\d{1,2}:(?:\d{1,2}:)?\d{2}(?:\.\d+)?(\])?/g;
    const topicRe = /^\*\*Topic \d+:[^\d]/;
    const subtopicRe = /^\* (\d{1,2}:\d{2}-\d{1,2}:\d{2}) \*\*(.*?):\*\* (.*)$/;
    const entries = [];
    for (const raw of linesRaw) {
        if (!raw || !raw.trim())
            continue;
        if (topicRe.test(raw)) {
            const title = raw.replace(topicRe, "").trim();
            entries.push({ level: 0, start: 0, title });
            continue;
        }
        const subtopicMatch = raw.match(subtopicRe);
        if (subtopicMatch) {
            const [_, timestamp, title, desc] = subtopicMatch;
            const [start, end] = timestamp.split("-");
            const startSeconds = parseTimestampToSeconds(start);
            if (startSeconds !== null) {
                entries.push({ level: 1, start: startSeconds, title: title.replace(/\*\*/g, ""), desc });
            }
            continue;
        }
        // Use the LAST timestamp on the line (safer when descriptions contain earlier times)
        const matches = Array.from(raw.matchAll(timeRe));
        const last = matches[matches.length - 1];
        if (!last)
            continue;
        const token = last[0].replace(/[\[\]]/g, "");
        const secs = parseTimestampToSeconds(token);
        if (secs == null)
            continue;
        const idx = raw.lastIndexOf(last[0]);
        // Prefer text before timestamp if present; else take text after timestamp
        const trailing = raw.slice(idx + last[0].length).replace(/^[\s\-–—:.]+/, "").trim();
        let leading = raw.slice(0, idx).trim();
        // If there was an earlier timestamp (e.g., start time in a range), drop it and any trailing separators like '-'
        if (leading) {
            const leadMatches = Array.from(leading.matchAll(timeRe));
            const lastLead = leadMatches[leadMatches.length - 1];
            if (lastLead) {
                const leadIdx = leading.lastIndexOf(lastLead[0]);
                if (leadIdx !== -1) {
                    leading = leading.slice(0, leadIdx).replace(/[\s\-–—:]+$/, "").trim();
                }
            }
        }
        const textPart = leading || trailing;
        // Robust split for "Title: Description" or "Title - Description"
        // Only split when the separator is followed by at least one space, so we don't
        // break on hyphens inside words like "Real-world".
        let title = (textPart || "").trim();
        let desc = undefined;
        if (textPart) {
            const m = /^(.*?)\s*(?::|[\-–—:-‐])\s+(.*)$/.exec(textPart);
            if (m) {
                title = m[1].trim();
                desc = m[2].trim() || undefined;
            }
        }
        // Safety guard: if desc accidentally captured multiple lines, keep only up to the first newline
        if (desc && desc.includes("\n"))
            desc = desc.split("\n")[0].trim();
        // Determine level: indentation or bullet implies level 1
        const leadingSpaceLen = raw.match(/^\s*/)?.[0]?.length ?? 0;
        const isBullet = /^\s*(?:[-*•\u2022]|\d+[.)]|\[\d+\])\s+/.test(raw);
        const level = leadingSpaceLen >= 2 || isBullet ? 1 : 0;
        entries.push({ level, start: secs, title, desc });
    }
    // If nothing parsed
    if (entries.length === 0)
        return { groups: [] };
    // Build groups: level 0 starts a new group; level 1 goes into current group
    const groups = [];
    let current = null;
    for (const e of entries) {
        if (e.level === 0) {
            current = { title: e.title, desc: e.desc, firstStart: e.start, items: [] };
            groups.push(current);
        }
        else {
            if (!current) {
                // Create a default group if none yet
                current = { title: "Manual Segments", firstStart: e.start, items: [] };
                groups.push(current);
            }
            current.items.push({ title: e.title, start: e.start, desc: e.desc });
        }
    }
    // If a group has no items, keep it as a standalone segment (handled by caller)
    // Sort items within each group and groups by start time to ensure order
    groups.sort((a, b) => (a.firstStart ?? 0) - (b.firstStart ?? 0));
    for (const g of groups) {
        g.items.sort((a, b) => a.start - b.start);
    }
    return { groups };
}
