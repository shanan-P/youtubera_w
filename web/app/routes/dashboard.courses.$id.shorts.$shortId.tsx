import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams, Link } from "@remix-run/react";
import { Button } from "~/components/Button";
import { useEffect, useRef } from "react";
import { requireUser } from "~/utils/auth.server";
import { getShortWithCourse, generateShortForEntry } from "~/services/shorts.server";

export const meta: MetaFunction = () => ([{ title: "Subtopic - Course | Youtubera" }]);

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const courseId = params.id || "";
  const shortId = params.shortId || "";
  if (!courseId || !shortId) return json({ error: "Missing route params" }, { status: 400 });
  const short = await getShortWithCourse(shortId);
  if (!short) return json({ error: "Segment not found" }, { status: 404 });
  if (short.chapter.courseId !== courseId) return json({ error: "Segment does not belong to course" }, { status: 400 });
  return json({ course: short.chapter.course, short });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const courseId = params.id || "";
  const shortId = params.shortId || "";
  if (!courseId || !shortId) return json({ error: "Missing route params" }, { status: 400 });
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "generateShort") {
    const res = await generateShortForEntry(shortId);
    if (!res.ok) return json({ error: res.error || "Failed to generate clip" }, { status: 400 });
    return redirect(`/dashboard/courses/${courseId}/shorts/${shortId}?updated=1`);
  }
  return json({ error: "Unknown action" }, { status: 400 });
}

export default function SubtopicDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const actionData = useActionData<typeof action>() as any;
  const [searchParams] = useSearchParams();
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {data.error}
      </div>
    );
  }
  const { course, short } = data as any;
  const displayTitle = String(short.title || "");
  const isGenerating = nav.state !== "idle" && nav.formData?.get("_intent") === "generateShort";
  const hasVideo = !!short.videoUrl;
  const hasClip = !!short.downloadUrl;
  const start = Math.max(0, Number(short.startTime || 0));
  const end = Math.max(start, Number(short.endTime || 0));
  const ytId = extractYouTubeId(short.videoUrl || "");
  const videoSrc = (short.videoUrl ? String(short.videoUrl) : "") + (start ? "#t=" + start : "");

  // One-time auto-pause preview for generated clip
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const didAutoPause = useRef(false);
  const userInteracted = useRef(false);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const didAutoDownload = useRef(false);
  

  // Reset gates per short load
  useEffect(() => {
    didAutoPause.current = false;
    userInteracted.current = false;
    didAutoDownload.current = false;
  }, [short?.id]);


  // Removed leftover hint overlay effect that references undefined setShowHint

  // Auto-start browser download when redirected after generation (?updated=1)
  useEffect(() => {
    if (!short?.downloadUrl || didAutoDownload.current) return;
    const wasJustGenerated = searchParams.get("updated") === "1";
    if (!wasJustGenerated) return;
    didAutoDownload.current = true;
    try {
      const a = document.createElement("a");
      a.href = short.downloadUrl;
      const fname = `${safeFilename(course.title)} - ${safeFilename(short.title)}.mp4`;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 0);
    } catch {} // ignore errors
  }, [short?.downloadUrl, searchParams]);

  const setInitialSeek = (v: HTMLVideoElement) => {
    try { v.currentTime = 0; } catch {} // ignore errors
  };

  useEffect(() => {
    if (!hasClip || didAutoPause.current) return;
    const v = videoRef.current;
    if (!v) return;
    // unmuted autoplay; note some browsers may block until user gesture

    // brief autoplay window handled via onPlaying + 300ms timer below

    // Start exactly at the beginning of the clip
    if (v.readyState >= 1 /* HAVE_METADATA */) {
      setInitialSeek(v);
    } else {
      v.addEventListener("loadedmetadata", () => setInitialSeek(v), { once: true });
    }

    // Detect if the user interacted with the page before playback starts
    const markInteracted = () => { userInteracted.current = true; };
    document.addEventListener("pointerdown", markInteracted, { once: true });
    document.addEventListener("keydown", markInteracted, { once: true });
    document.addEventListener("touchstart", markInteracted, { once: true });

    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const requestPause = () => {
      if (didAutoPause.current || userInteracted.current) return;
      try { v.autoplay = false; } catch {} // ignore errors
      try { v.pause(); } catch {} // ignore errors
      if (v.paused) {
        // Reset to poster so a thumbnail is shown instead of a random frame
        try { v.currentTime = 0; } catch {} // ignore errors
        try { v.load(); } catch {} // ignore errors
        didAutoPause.current = true;
      }
    };
    const onPlaying = () => {
      if (didAutoPause.current || userInteracted.current) return;
      timer = setTimeout(() => {
        requestPause();
        if (!didAutoPause.current && !userInteracted.current && !v.paused) {
          retry = setTimeout(() => requestPause(), 150);
        }
      }, 300);
    };

    v.addEventListener("playing", onPlaying, { once: true });

    const playPromise = v.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.catch(() => {/* ignore autoplay block */});
    }

    // Do not infer playback from paused flag; wait for explicit 'playing' event

    return () => {
      v.removeEventListener("playing", onPlaying);
      if (timer) clearTimeout(timer);
      if (retry) clearTimeout(retry);
      document.removeEventListener("pointerdown", markInteracted);
      document.removeEventListener("keydown", markInteracted);
      document.removeEventListener("touchstart", markInteracted);
      v.removeEventListener("loadedmetadata", () => setInitialSeek(v));
    };
  }, [hasClip, short?.downloadUrl]);

  // YouTube fallback: autoplay then auto-pause after 300ms from timestamp start
  useEffect(() => {
    if (hasClip) return; // only applies to YT preview
    if (!ytId) return;
    const mountEl = ytContainerRef.current;
    if (!mountEl) return;

    const markInteracted = () => { userInteracted.current = true; };
    document.addEventListener("pointerdown", markInteracted, { once: true });
    document.addEventListener("keydown", markInteracted, { once: true });
    document.addEventListener("touchstart", markInteracted, { once: true });

    let player: any;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry1: ReturnType<typeof setTimeout> | null = null;
    const init = () => {
      const YT = (window as any).YT;
      if (!YT || !YT.Player) return;
      player = new YT.Player(mountEl, {
        videoId: ytId,
        playerVars: {
          start,
          end: end > start ? end : undefined,
          autoplay: 1,
          playsinline: 1,
          disablekb: 0,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            // Prepare and start, then pause after 300ms like a user click
            try { player.seekTo(start, true); } catch {} // ignore errors
            try { if (typeof player.playVideo === 'function') player.playVideo(); } catch {} // ignore errors
            ytPlayerRef.current = player;
            if (didAutoPause.current || userInteracted.current) return;
            timer = setTimeout(() => {
              if (didAutoPause.current || userInteracted.current) return;
              try { player.pauseVideo && player.pauseVideo(); } catch {} // ignore errors
              const YTNS = (window as any).YT;
              if (YTNS && typeof player.getPlayerState === 'function') {
                const st = player.getPlayerState();
                if (st === YTNS.PlayerState.PAUSED) {
                  didAutoPause.current = true;
                } else {
                  // small retry
                  retry1 = setTimeout(() => {
                    try { player.pauseVideo && player.pauseVideo(); } catch {} // ignore errors
                    const st2 = typeof player.getPlayerState === 'function' ? player.getPlayerState() : undefined;
                    if (YTNS && st2 === YTNS.PlayerState.PAUSED) {
                      didAutoPause.current = true;
                    }
                  }, 160);
                }
              }
            }, 300);
          },
        },
      });
    };

    // no-op helper removed; we pause in onReady after a short delay
    const w = window as any;
    if (w.YT && w.YT.Player) {
      init();
    } else {
      if (!w._ytApiPromise) {
        w._ytApiPromise = new Promise((resolve) => {
          const tag = document.createElement("script");
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
          w.onYouTubeIframeAPIReady = () => resolve(null);
        });
      }
      w._ytApiPromise.then(() => init());
    }

    return () => {
      if (player && typeof player.destroy === "function") player.destroy();
      ytPlayerRef.current = null;
      if (timer) clearTimeout(timer);
      if (retry1) clearTimeout(retry1);
      document.removeEventListener("pointerdown", markInteracted);
      document.removeEventListener("keydown", markInteracted);
      document.removeEventListener("touchstart", markInteracted);
    };
  }, [hasClip, ytId, start, end]);

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Button asChild variant="link">
          <Link to={`/dashboard/courses/${course.id}`}>&larr; Back to Course</Link>
        </Button>
      </div>
      {actionData?.error && (
<div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {data.error}
      </div>
      )}

<div className="rounded border border-gray-200 p-4 dark:border-gray-800">
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
<div>
  <div className="font-medium">{displayTitle}</div>
  {short.processingType === 'custom' && !!short.customQuery && (
    <div className="text-[13px] opacity-80">{short.customQuery}</div>
  )}
  <div className="text-xs opacity-70">{formatTime(start)} - {formatTime(end)} ({formatDurationMinutesRange((short?.duration ?? (end - start)) as any)})</div>
</div>
<div className="flex items-center gap-2">
{short.downloadUrl ? (
<Button asChild variant="primary" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
  <a
    href={short.downloadUrl}
    download={`${safeFilename(course.title)} - ${safeFilename(short.title)}.mp4`}
  >
    Download
  </a>
</Button>
) : (
<Form method="post">
<input type="hidden" name="_intent" value="generateShort" />
<Button
  variant="primary"
  size="sm"
  disabled={!hasVideo || isGenerating}
  title={!hasVideo ? "Missing video URL for this segment" : undefined}
>
  {isGenerating ? "Generating…" : "Generate"}
</Button>
</Form>
)}
</div>
</div>
          
        </div>

        <div className="mt-4">
          {hasClip ? (
            <div className="relative">
              <video
                ref={videoRef}
                className="h-auto w-full rounded"
                controls
                preload="metadata"
                autoPlay
                tabIndex={0}
                playsInline
                poster={short.thumbnailUrl || course.thumbnailUrl || undefined}
                src={short.downloadUrl}
              ></video>
            </div>
          ) : hasVideo ? (
            ytId ? (
              <div className="aspect-video w-full relative" tabIndex={0} role="group">
                <div
                  className="h-full w-full rounded bg-black"
                  ref={ytContainerRef}
                  aria-label={short.title}
                />
              </div>
            ) : (
              <div className="relative">
                <video
                  className="h-auto w-full rounded"
                  tabIndex={0}
                  controls
                  poster={short.thumbnailUrl || course.thumbnailUrl || undefined}
                  src={videoSrc}
                ></video>
              </div>
            )
          ) : (
            <p className="text-sm opacity-70">No video URL for this segment. Provide a YouTube URL when creating the course in manual mode to enable preview and clip generation.</p>
          )}
        </div>
    </div>
  );
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const path = u.pathname.split("/").filter(Boolean);
      if (path[0] === "embed" && path[1]) return path[1];
      if (path[0] === "shorts" && path[1]) return path[1];
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return id;
    }
  } catch {} 
  return null;
}

function formatTime(sec?: number | null) {
  if (sec == null) return "--";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

// Convert seconds to a friendly minutes label: "<1 min", "2 min", "1-2 min"
function formatDurationMinutesRange(totalSec?: number | null) {
  const s = Math.max(0, Math.floor(Number(totalSec || 0)));
  if (s < 60) return "<1 min";
  const down = Math.floor(s / 60);
  const up = Math.ceil(s / 60);
  if (down === up) return `${down} min`;
  return `${down}-${up} min`;
}

function safeFilename(s?: string | null) {
  const val = String(s || "").normalize("NFKD");
  return val
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}