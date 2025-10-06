import { prisma } from "~/utils/db.server";
import { clipVideoSegment, downloadYouTubeVideo } from "~/services";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function publicShortsPaths(shortId: string) {
  const dir = resolvePath("public", "downloads", "shorts", shortId);
  const clipAbs = join(dir, "clip.mp4");
  const thumbAbs = join(dir, "thumb.jpg");
  const clipUrl = `/downloads/shorts/${shortId}/clip.mp4`;
  const thumbUrl = `/downloads/shorts/${shortId}/thumb.jpg`;
  return { dir, clipAbs, thumbAbs, clipUrl, thumbUrl };
}

function isPublicDownloadsPath(url: string) {
  return url.startsWith("/downloads/") || url.startsWith("/uploads/");
}

function localPathFromPublicUrl(url: string) {
  // Map a public URL like /downloads/videos/<id>/<file> to absolute path in public/
  return resolvePath("public", url.replace(/^\/+/, ""));
}

export function generateShortTitleStub(originalTitle?: string) {
  const base = originalTitle?.trim() || "Short Clip";
  return base.length > 80 ? `${base.slice(0, 77)}...` : base;
}

export async function generateShortForEntry(shortId: string) {
  const short = await prisma.shortVideo.findUnique({
    where: { id: shortId },
    include: {
      chapter: {
        include: { course: true }
      }
    }
  });
  if (!short) return { ok: false as const, error: "ShortVideo not found" };
  if (short.startTime == null || short.endTime == null) {
    return { ok: false as const, error: "ShortVideo missing start/end time" };
  }
  if (!short.videoUrl) {
    return { ok: false as const, error: "ShortVideo missing videoUrl" };
  }

  // Ensure we have a local source video path
  let sourcePath: string | null = null;
  if (isPublicDownloadsPath(short.videoUrl)) {
    sourcePath = localPathFromPublicUrl(short.videoUrl);
  } else {
    // Assume YouTube URL or remote URL handled by yt-dlp
    const dl = await downloadYouTubeVideo(short.videoUrl);
    if (!dl.ok || !dl.videoPath) {
      const advice = "; try again later or set YTDLP_COOKIES_FILE to a browser-exported cookies.txt if the video requires cookies";
      return { ok: false as const, error: (dl.error || "Failed to download source video") + advice };
    }
    sourcePath = dl.videoPath;
    // Persist local playback URL for this chapter so future previews use the local <video>
    // instead of falling back to a YouTube embed. We update any ShortVideo in the same
    // chapter that still points at the original remote URL.
    try {
      if (dl.publicUrl && short.chapterId && short.videoUrl) {
        await prisma.shortVideo.updateMany({
          where: { chapterId: short.chapterId, videoUrl: short.videoUrl },
          data: { videoUrl: dl.publicUrl }
        });
      }
    } catch (e) {
      // Non-fatal: continue even if we cannot persist the local URL
      console.warn("[shorts] failed to persist local source URL:", e);
    }
  }

  const { dir, clipAbs, thumbAbs, clipUrl, thumbUrl } = publicShortsPaths(short.id);
  ensureDir(dir);

  const res = await clipVideoSegment(
    sourcePath,
    Math.max(0, Math.floor(short.startTime)),
    Math.max(0, Math.floor(short.endTime)),
    clipAbs,
    thumbAbs
  );
  if (!res.ok) {
    return { ok: false as const, error: res.error || res.stderr || "ffmpeg failed" };
  }

  // Update DB with URLs
  const updated = await prisma.shortVideo.update({
    where: { id: short.id },
    data: {
      downloadUrl: clipUrl,
      thumbnailUrl: res.thumbnail ? thumbUrl : short.thumbnailUrl,
      // fill duration if missing
      duration:
        short.duration != null
          ? short.duration
          : Math.max(0, Math.floor(short.endTime) - Math.max(0, Math.floor(short.startTime)))
    }
  });

  // Optional: export a local copy to user-defined directory
  try {
    const exportDir = (
      [
        "short_export_dir",
        "SHORT_EXPORT_DIR",
        "SHORTS_EXPORT_DIR"
      ]
        .map((k) => process.env[k] || "")
        .find((v) => v && v.trim().length > 0) || ""
    ).trim();
    if (exportDir) {
      ensureDir(exportDir);
      const safe = (s: string) =>
        s
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // remove invalid Win chars
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
      const courseTitle = safe(short.chapter?.course?.title || "Course");
      const shortTitle = safe(short.title || updated.id);
      const baseName = `${courseTitle} - ${shortTitle}`.replace(/[ .]+$/g, "");
      const destMp4 = join(exportDir, `${baseName || updated.id}.mp4`);
      copyFileSync(clipAbs, destMp4);
      if (res.thumbnail) {
        const destJpg = join(exportDir, `${baseName || updated.id}.jpg`);
        try { copyFileSync(thumbAbs, destJpg); } catch {}
      }
    }
  } catch (e) {
    // Do not fail generation if export copy fails; log and continue
    console.warn("[shorts] export copy failed:", e);
  }

  return { ok: true as const, shortId: updated.id, downloadUrl: updated.downloadUrl, thumbnailUrl: updated.thumbnailUrl };
}

export async function generateShortsForCourse(courseId: string, maxCount = 10) {
  const shorts = await prisma.shortVideo.findMany({
    where: { chapter: { courseId } },
    orderBy: [{ orderIndex: "asc" }]
  });
  const candidates = shorts.filter((s) => s.startTime != null && s.endTime != null && !s.downloadUrl);
  const limited = candidates.slice(0, maxCount);

  const results: Array<{ id: string; ok: boolean; error?: string; downloadUrl?: string }> = [];
  for (const s of limited) {
    const r = await generateShortForEntry(s.id);
    results.push({ id: s.id, ok: r.ok, error: (r as any).error, downloadUrl: (r as any).downloadUrl });
  }
  return { ok: true as const, generated: results };
}

export async function getShortWithCourse(shortId: string) {
  return prisma.shortVideo.findUnique({
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
