import { prisma } from "~/utils/db.server";
import type { Course, ContentType, ProcessingType } from "~/types/models";
import { ChapterContent } from "~/types/models";
import type { PlaylistEntry } from "./video.server";
import {
  isPlaylistUrl,
  extractYouTubePlaylist,
  extractYouTubeMetadata,
  getYouTubeChapters
} from "./video.server";
import { saveTxtFromUrl, saveUploadedPdf } from "../services/pdf.server";
import { extractTextFromPdfWithAdobe } from "../services/adobe-extract.server";
import { formatWithGemini } from "./gemini.server";
import { unstable_createFileUploadHandler, unstable_parseMultipartFormData } from "@remix-run/node";
import { saveUploadedAudio, processAudio } from "./audio.server";

// --- Type definitions ---

export type YouTubeSource = {
  type: "youtube";
  url: string;
  segmentation: "chapter" | "manual" | "audio";
  timestampsText?: string;
};

export type YouTubeTextSource = { type: "youtube_text"; url: string };

export type PdfUrlSource = { type: "pdf_url"; url: string };

export type FileSource = { type: "file"; file: File; audioProcessing?: "segmentation" | "reading" };

export type CourseSource = YouTubeSource | PdfUrlSource | FileSource | YouTubeTextSource;

export type ParsedItem = { title: string; start: number; end: number | null; desc?: string };
export type ParsedGroup = { title: string; desc?: string; firstStart: number | null; items: ParsedItem[] };

export interface TimestampParseResult {
  groups: ParsedGroup[];
}

export interface CreateCourseInput {
  title: string;
  contentType: ContentType;
  description?: string | null;
  youtuberName?: string | null;
  channelName?: string | null;
  authorName?: string | null;
  thumbnailUrl?: string | null;
  sourceUrl?: string | null;
  filePath?: string | null;
  textContent?: string | null;
  totalDuration?: number | null;
  totalPages?: number | null;
  createdById?: string | null;
  [key: string]: any; // Allow additional fields
};

export type UpdateCourseInput = Partial<Omit<CreateCourseInput, "contentType" | "title">> & {
  title?: string;
  contentType?: ContentType;
  textContent?: string | null;
  processingType?: ProcessingType | null;
};

// --- Helper functions ---

function parseTimestampToSeconds(token: string): number | null {
  // Accept formats like HH:MM:SS(.ms), H:MM:SS, MM:SS, M:SS
  const clean = token.replace(/[ \[ \] \( \) ]/g, "").trim();
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

export function parseTimestampSummary(text: string): TimestampParseResult {
  const groups: ParsedGroup[] = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  const lineRegex = /^\* \*\*(.*?)\s(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2}):\*\*\s*(.*)$/;

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (match) {
      const title = match[1].trim();
      const start = parseTimestampToSeconds(match[2]);
      const end = parseTimestampToSeconds(match[3]);
      const desc = match[4].trim();

      if (title && start !== null && end !== null) {
        const group: ParsedGroup = {
          title: title,
          firstStart: start,
          items: [{ title: title, start: start, end: end, desc: desc }]
        };
        groups.push(group);
      }
    }
  }

  return { groups };
}

// --- CRUD functions ---

export async function createCourse(data: CreateCourseInput): Promise<Course> {
  const course = await prisma.course.create({ data });

  await prisma.$executeRaw`
    UPDATE "Course"
    SET "search_vector" = 
      setweight(to_tsvector('english', COALESCE(${course.title}, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(${course.description}, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(${course.textContent}, '')), 'C')
    WHERE id = ${course.id}
  `;

  return course;
}

export async function getCourseById(id: string) {
  return prisma.course.findUnique({
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

export async function listCourses() {
  return prisma.course.findMany({ orderBy: { createdAt: "desc" } });
}

export async function updateCourse(id: string, data: UpdateCourseInput) {
  const course = await prisma.course.update({ where: { id }, data });

  await prisma.$executeRaw`
    UPDATE "Course"
    SET "search_vector" = 
      setweight(to_tsvector('english', COALESCE(${course.title}, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(${course.description}, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(${course.textContent}, '')), 'C')
    WHERE id = ${course.id}
  `;

  return course;
}

export async function deleteCourse(id: string) {
  return prisma.course.delete({ where: { id } });
}

// --- Main function ---

export async function createCourseFromSource(
  source: CourseSource,
  userId?: string
): Promise<{ jobId: string; courseId?: string; noChapters?: boolean; error?: string }> {
  // NOTE: This is a stub that simulates job creation as per `design.md` and `tasks.md`.
  // Real implementation will enqueue a job (Bull) and call video/pdf services.
  const jobId = `job_${Date.now()}`;
  switch (source.type) {
    case "youtube": {
      const isPl = isPlaylistUrl(source.url);
      try {
        if (isPl) {
          const pl = await extractYouTubePlaylist(source.url);
          const title = pl?.title || "YouTube Playlist";
          const thumb = pl?.entries?.[0]?.thumbnailUrl || null;
          const uploader = pl?.entries?.[0]?.uploader || null;
          const totalDur = pl?.entries?.reduce((sum: number, e: PlaylistEntry) => sum + (e.duration ?? 0), 0) ?? null;

          const created = await createCourse({
            title,
            contentType: "youtube_playlist" as ContentType,
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
              await prisma.chapter.create({
                data: {
                  courseId: created.id,
                  title: entry.title || `Video ${idx + 1}`,
                  contentType: ChapterContent.VIDEO,
                  originalContentId: entry.id ?? undefined,
                  orderIndex: idx++
                }
              });
            }
          }
          return { jobId, courseId: created.id };
        } else {
          const info = await extractYouTubeMetadata(source.url);
          const title = info?.title || "YouTube Video";
          const thumb = info?.thumbnail || info?.thumbnails?.[0]?.url || null;
          const duration = info?.duration ?? null;
          const uploader = info?.uploader ?? null;
          const channel = info?.channel ?? null;
          const description = info?.description ?? null;

          if (source.segmentation === "chapter") {
            // Strict: require chapters to exist (from YouTube Data API). Do not create a course otherwise.
            const chapters = await getYouTubeChapters(source.url);
            if (!chapters || chapters.length === 0) {
              return { jobId, noChapters: true };
            }
            const created = await createCourse({
              title,
              contentType: "youtube_video" as ContentType,
              description,
              youtuberName: uploader,
              channelName: channel,
              thumbnailUrl: thumb,
              sourceUrl: source.url,
              totalDuration: duration ? Math.round(duration) : null,
              createdById: userId
            });
            const parent = await prisma.chapter.create({
              data: {
                courseId: created.id,
                title: "Chapters",
                contentType: ChapterContent.VIDEO,
                orderIndex: 0
              }
            });
            let idx = 0;
            for (const ch of chapters) {
              const start = Math.max(0, Math.floor(Number(ch.start_time ?? 0)));
              const end = Math.max(0, Math.floor(Number(ch.end_time ?? 0)));
              const segDuration = end > start ? end - start : null;
              await prisma.shortVideo.create({
                data: {
                  chapterId: parent.id,
                  title: ch.title || `Chapter ${idx + 1}`,
                  duration: segDuration,
                  videoUrl: created.sourceUrl || source.url,
                  thumbnailUrl: thumb || undefined,
                  startTime: start,
                  endTime: end,
                  processingType: "chapter" as ProcessingType,
                  orderIndex: idx++
                }
              });
            }
            return { jobId, courseId: created.id };
          } else if (source.segmentation === "manual") {
            const created = await createCourse({
              title,
              contentType: "youtube_video" as ContentType,
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
              const parent = await prisma.chapter.create({
                data: {
                  courseId: created.id,
                  title: "Manual Segments",
                  contentType: ChapterContent.VIDEO,
                  orderIndex: 0
                }
              });
              await prisma.shortVideo.create({
                data: {
                  chapterId: parent.id,
                  title: "Full Video",
                  duration: totalDur,
                  videoUrl: created.sourceUrl || source.url,
                  thumbnailUrl: thumb || undefined,
                  startTime: 0,
                  endTime: totalDur ?? 0,
                  processingType: "custom" as ProcessingType,
                  orderIndex: 0
                }
              });
            } else {
              // Create chapters for each top-level group
              let chIdx = 0;
              for (let gIdx = 0; gIdx < parsed.groups.length; gIdx++) {
                const group = parsed.groups[gIdx];
                const nextGroupStart = parsed.groups[gIdx + 1]?.firstStart ?? null;
                const chapter = await prisma.chapter.create({
                  data: {
                    courseId: created.id,
                    title: group.title || `Topic ${gIdx + 1}`,
                    contentType: ChapterContent.VIDEO,
                    orderIndex: chIdx++
                  }
                });
                // If group has no items, treat group itself as a single segment (preserve any description)
                const items = group.items.length > 0
                  ? group.items
                  : [{ title: group.title || `Topic ${gIdx + 1}`, start: group.firstStart ?? 0, end: null, desc: group.desc }];

                // Compute end times for items within the group
                for (let i = 0; i < items.length; i++) {
                  const it = items[i];
                  const nextStart = items[i + 1]?.start ?? nextGroupStart ?? totalDur ?? (it.start + 60);
                  const start = Math.max(0, Math.floor(it.start));
                  const end = it.end ? Math.max(start, Math.floor(it.end) + 2) : Math.max(start, Math.floor(nextStart));
                  const segDuration = end > start ? end - start : null;
                  await prisma.shortVideo.create({
                    data: {
                      chapterId: chapter.id,
                      title: it.title || `Segment ${i + 1}`,
                      duration: segDuration,
                      videoUrl: created.sourceUrl || source.url,
                      thumbnailUrl: thumb || undefined,
                      startTime: start,
                      endTime: end,
                      processingType: "custom" as ProcessingType, // mark as user-provided
                      customQuery: it.desc ? String(it.desc).trim() : null,
                      orderIndex: i
                    }
                  });
                }
              }
            }
            return { jobId, courseId: created.id };
          } else if (source.segmentation === "audio") {
            const created = await createCourse({
              title,
              contentType: "youtube_video" as ContentType,
              description,
              youtuberName: uploader,
              channelName: channel,
              thumbnailUrl: thumb,
              sourceUrl: source.url,
              totalDuration: duration ? Math.round(duration) : null,
              createdById: userId
            });

            const { processVideo } = await import('./video.server');
            const result = await processVideo(source.url, "ai");

            if (!result.results) {
              throw new Error("Failed to process video content from audio");
            }

            const parsed = parseTimestampSummary(result.results || "");

            if (!parsed || parsed.groups.length === 0) {
              // Fallback: single full-video segment if nothing could be parsed
              const parent = await prisma.chapter.create({
                data: {
                  courseId: created.id,
                  title: "AI Segments",
                  contentType: ChapterContent.VIDEO,
                  orderIndex: 0
                }
              });
              await prisma.shortVideo.create({
                data: {
                  chapterId: parent.id,
                  title: "Full Video",
                  duration: duration ? Math.round(duration) : null,
                  videoUrl: created.sourceUrl || source.url,
                  thumbnailUrl: thumb || undefined,
                  startTime: 0,
                  endTime: duration ? Math.round(duration) : 0,
                  processingType: "ai" as ProcessingType,
                  orderIndex: 0
                }
              });
            } else {
              // Create chapters for each top-level group
              let chIdx = 0;
              for (let gIdx = 0; gIdx < parsed.groups.length; gIdx++) {
                const group = parsed.groups[gIdx];
                const nextGroupStart = parsed.groups[gIdx + 1]?.firstStart ?? null;
                const chapter = await prisma.chapter.create({
                  data: {
                    courseId: created.id,
                    title: group.title || `Topic ${gIdx + 1}`,
                    contentType: ChapterContent.VIDEO,
                    orderIndex: chIdx++
                  }
                });
                const items = group.items.length > 0
                  ? group.items
                  : [{ title: group.title || `Topic ${gIdx + 1}`, start: group.firstStart ?? 0, end: null, desc: group.desc }];

                for (let i = 0; i < items.length; i++) {
                  const it = items[i];
                  const nextStart = items[i + 1]?.start ?? nextGroupStart ?? (duration ? Math.round(duration) : null) ?? (it.start + 60);
                  const start = Math.max(0, Math.floor(it.start));
                  const end = it.end ? Math.max(start, Math.floor(it.end) + 2) : Math.max(start, Math.floor(nextStart));
                  const segDuration = end > start ? end - start : null;
                  await prisma.shortVideo.create({
                    data: {
                      chapterId: chapter.id,
                      title: it.title || `Segment ${i + 1}`,
                      duration: segDuration,
                      videoUrl: created.sourceUrl || source.url,
                      thumbnailUrl: thumb || undefined,
                      startTime: start,
                      endTime: end,
                      processingType: "ai" as ProcessingType,
                      customQuery: it.desc ? String(it.desc).trim() : null,
                      orderIndex: i
                    }
                  });
                }
              }
            }
            
            await updateCourse(created.id, {
              processingType: 'ai',
              textContent: result.results || ""
            });

            return { jobId, courseId: created.id };
          }
          // Default return if branch conditions change in the future
          return { jobId };
        }
      } catch (e) {
        console.warn("[createCourseFromSource] YouTube metadata failed:", e);
        // In strict chapter-based mode, do NOT create any fallback course.
        if (!isPl && source.segmentation === "chapter") {
          return { jobId, noChapters: true };
        }
        const created = await createCourse({
          title: isPl ? "YouTube Playlist Course" : "YouTube Video Course",
          contentType: (isPl ? "youtube_playlist" : "youtube_video") as ContentType,
          description: "Created from YouTube URL (fallback)",
          sourceUrl: source.url,
          createdById: userId
        });
        return { jobId, courseId: created.id };
      }
    }
      break;
    case "youtube_text": {
      const { processVideo } = await import('./video.server');
      const result = await processVideo(source.url, "transcript");

      if (result.error || !result.results) {
        throw new Error(result.error || "Failed to process video content from audio");
      }

      const info = await extractYouTubeMetadata(source.url);
      const title = info?.title || "YouTube Video";
      const thumb = info?.thumbnail || info?.thumbnails?.[0]?.url || null;
      const duration = info?.duration ?? null;
      const uploader = info?.uploader ?? null;
      const channel = info?.channel ?? null;
      const description = info?.description ?? null;

      const created = await createCourse({
        title,
        contentType: "youtube_text" as ContentType,
        description,
        youtuberName: uploader,
        channelName: channel,
        thumbnailUrl: thumb,
        sourceUrl: source.url,
        totalDuration: duration ? Math.round(duration) : null,
        createdById: userId,
        textContent: result.results,
        filePath: result.audioPath
      });

      return { jobId, courseId: created.id };
    }
    case "pdf_url": {
      // Create a course from a URL and persist the text content locally.
      const url = source.url;
      const fallbackTitle = decodeURIComponent(
        (url.split("/").pop() || "Article").replace(/\.[^/.]+$/, "")
      ) || "Article Course";
      const created = await createCourse({
        title: fallbackTitle,
        contentType: "pdf_textbook" as ContentType,
        sourceUrl: url,
        createdById: userId
      });
      
      try {
        const saveResult = await saveTxtFromUrl(url, created.id);
        
        const courseFilePath = saveResult.relPath;
        const courseTextContent = saveResult.content;

        // Update course with extracted text and file path
        await updateCourse(created.id, { 
          filePath: courseFilePath,
          textContent: courseTextContent,
        });
        
        return { jobId, courseId: created.id };
        
      } catch (e) {
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
      const isAudio = file.type.startsWith('audio/');
      const audioProcessing = source.audioProcessing;

      const created = await createCourse({
        title: file.name,
        contentType: isPdf ? 'pdf_textbook' : (isVideo ? 'uploaded_video' : (isAudio ? (audioProcessing === 'segmentation' ? 'audiobook' : 'audiobook_text') : 'uploaded_video')) as ContentType,
        createdById: userId
      });
      
      try {
        if (isPdf) {
          const { absPath, relPath: savedRelPath } = await saveUploadedPdf(file, created.id);
          const relPath = savedRelPath;
          
          // Try Adobe's extraction
          let extractionResult;
          
          try {
            extractionResult = await extractTextFromPdfWithAdobe(absPath);
          } catch (extractError) {
            console.warn("[createCourseFromSource] Adobe extraction failed:", extractError);
            // Continue with empty text content since Adobe extraction failed
            extractionResult = { text: "" };
          }

          // Update course with extracted text and file path
          await updateCourse(created.id, { 
            filePath: relPath,
            textContent: extractionResult.text || "",
          });
        } else if (isVideo) {
          console.log("[createCourseFromSource] Processing video file.");

          // Process the video with AI to extract topics
          const { processVideo, saveUploadedVideo } = await import('./video.server');
          const saveResult = await saveUploadedVideo(file, created.id);
          const relPath = saveResult.relPath;

          console.log("[createCourseFromSource] Starting video processing");
          const result = await processVideo(file, "ai");
          console.log("[createCourseFromSource] Video processing completed:", result);

          const parsed = parseTimestampSummary(result.results || "");

          if (!parsed || parsed.groups.length === 0) {
            // Fallback: single full-video segment if nothing could be parsed
            const parent = await prisma.chapter.create({
              data: {
                courseId: created.id,
                title: "Manual Segments",
                contentType: ChapterContent.VIDEO,
                orderIndex: 0
              }
            });
            await prisma.shortVideo.create({
              data: {
                chapterId: parent.id,
                title: "Full Video",
                duration: null,
                videoUrl: relPath,
                thumbnailUrl: undefined,
                startTime: 0,
                endTime: 0,
                processingType: "custom" as ProcessingType,
                orderIndex: 0
              }
            });
          } else {
            // Create chapters for each top-level group
            let chIdx = 0;
            for (let gIdx = 0; gIdx < parsed.groups.length; gIdx++) {
              const group = parsed.groups[gIdx];
              const nextGroupStart = parsed.groups[gIdx + 1]?.firstStart ?? null;
              const chapter = await prisma.chapter.create({
                data: {
                  courseId: created.id,
                  title: group.title || `Topic ${gIdx + 1}`,
                  contentType: ChapterContent.VIDEO,
                  orderIndex: chIdx++
                }
              });
              // If group has no items, treat group itself as a single segment (preserve any description)
              const items = group.items.length > 0
                ? group.items
                : [{ title: group.title || `Topic ${gIdx + 1}`, start: group.firstStart ?? 0, end: null, desc: group.desc }];

              // Compute end times for items within the group
              for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const nextStart = items[i + 1]?.start ?? nextGroupStart ?? (it.start + 60);
                const start = Math.max(0, Math.floor(it.start));
                const end = it.end ? Math.max(start, Math.floor(it.end) + 2) : Math.max(start, Math.floor(nextStart));
                const segDuration = end > start ? end - start : null;
                await prisma.shortVideo.create({
                  data: {
                    chapterId: chapter.id,
                    title: it.title || `Segment ${i + 1}`,
                    duration: segDuration,
                    videoUrl: relPath,
                    thumbnailUrl: undefined,
                    startTime: start,
                    endTime: end,
                    processingType: "custom" as ProcessingType, // mark as user-provided
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
        } else if (isAudio) {
          const saveResult = await saveUploadedAudio(file, created.id);
          const relPath = saveResult.relPath;

          if (audioProcessing === 'segmentation') {
            console.log("[createCourseFromSource] Starting audio processing for segmentation");
            const result = await processAudio(file, "segmentation");
            console.log("[createCourseFromSource] Audio processing completed:", result);

            if (result.error) {
              throw new Error(result.error);
            }

            const parsed = parseTimestampSummary(result.results || "");

            if (!parsed || parsed.groups.length === 0) {
              // Fallback: single full-audio segment if nothing could be parsed
              const parent = await prisma.chapter.create({
                data: {
                  courseId: created.id,
                  title: "Audio Segments",
contentType: ChapterContent.AUDIO,
                  orderIndex: 0
                }
              });
              await prisma.shortVideo.create({
                data: {
                  chapterId: parent.id,
                  title: "Full Audio",
                  duration: null,
                  videoUrl: relPath,
                  thumbnailUrl: undefined,
                  startTime: 0,
                  endTime: 0,
                  processingType: "custom" as ProcessingType,
                  orderIndex: 0
                }
              });
            } else {
              // Create chapters for each top-level group
              let chIdx = 0;
              for (let gIdx = 0; gIdx < parsed.groups.length; gIdx++) {
                const group = parsed.groups[gIdx];
                const nextGroupStart = parsed.groups[gIdx + 1]?.firstStart ?? null;
                const chapter = await prisma.chapter.create({
                  data: {
                    courseId: created.id,
                    title: group.title || `Topic ${gIdx + 1}`,
  contentType: ChapterContent.AUDIO,
                    orderIndex: chIdx++
                  }
                });
                // If group has no items, treat group itself as a single segment (preserve any description)
                const items = group.items.length > 0
                  ? group.items
                  : [{ title: group.title || `Topic ${gIdx + 1}`, start: group.firstStart ?? 0, end: null, desc: group.desc }];

                // Compute end times for items within the group
                for (let i = 0; i < items.length; i++) {
                  const it = items[i];
                  const nextStart = items[i + 1]?.start ?? nextGroupStart ?? (it.start + 60);
                  const start = Math.max(0, Math.floor(it.start));
                  const end = it.end ? Math.max(start, Math.floor(it.end) + 2) : Math.max(start, Math.floor(nextStart));
                  const segDuration = end > start ? end - start : null;
                  await prisma.shortVideo.create({
                    data: {
                      chapterId: chapter.id,
                      title: it.title || `Segment ${i + 1}`,
                      duration: segDuration,
                      videoUrl: relPath, // Storing audio path in videoUrl
                      thumbnailUrl: undefined,
                      startTime: start,
                      endTime: end,
                      processingType: "custom" as ProcessingType, // mark as user-provided
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
          } else if (audioProcessing === 'reading') {
            console.log("[createCourseFromSource] Starting audio processing for reading experience");
            const result = await processAudio(file, "transcription");
            console.log("[createCourseFromSource] Audio processing completed:", result);

            if (result.error) {
              throw new Error(result.error);
            }

            await updateCourse(created.id, {
              filePath: relPath,
              processingType: 'ai',
              textContent: result.results || ""
            });
          }
        }
        
        return { jobId, courseId: created.id };
        
      } catch (e) {
        console.warn("[createCourseFromSource] File processing failed:", e);
        return { 
          jobId, 
          courseId: created.id, 
          error: e instanceof Error ? e.message : "Failed to process uploaded file" 
        };
      }
    }
    
    default:
      return { jobId, error: `Unsupported source type: ${(source as any).type}` };
  }
}
