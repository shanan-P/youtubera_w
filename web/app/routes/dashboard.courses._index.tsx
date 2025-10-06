import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useFetcher, useLoaderData, useNavigate, useLocation, useRevalidator } from "@remix-run/react";
import { Button } from "~/components/Button";
import { useEffect, useRef, useState, useMemo } from "react";
import { requireUser } from "~/utils/auth.server";
import type { Course } from '@prisma/client';
import { 
  listCourses, 
  createCourse, 
  updateCourse, 
  deleteCourse,
  parseTimestampSummary,
  type ParsedGroup,
  type ParsedItem
} from '~/services/course.server';
import { processVideo, processAudio } from '~/services';

export const meta: MetaFunction = () => ([{ title: "Courses - Dashboard | Youtubera" }]);

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const courses = await listCourses();
  const url = new URL(request.url);
  const updated = url.searchParams.get("updated") === "1";
  const noChapters = url.searchParams.get("noChapters") === "1";
  return json({ courses, updated, noChapters });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  try {
    if (intent === "create") {
      const title = String(form.get("title") || "").trim();
      const contentType = String(form.get("contentType") || "").trim();
      const description = String(form.get("description") || "").trim() || null;
            const videoFile = form.get("videoFile") as File | null;
      const audioFile = form.get("audioFile") as File | null;
      
      if (!title || !contentType) {
        return json({ error: "Title and content type are required" }, { status: 400 });
      }

      // Handle video upload if this is a video content type
      let filePath = null;
      if (contentType === 'uploaded_video') {
        if (!videoFile || !(videoFile instanceof File)) {
          return json({ error: "Video file is required" }, { status: 400 });
        }
        
        // Create course first to get an ID
        const course = await createCourse({ 
          title, 
          contentType: contentType as any, 
          description, 
          createdById: user.id 
        });
        
        // Process the video to extract content
        const result = await processVideo(videoFile, 'ai');
        
        if (!result.results) {
          throw new Error("Failed to process video content");
        }
        
        // Parse the Gemini response to extract timestamps
        const parsed = parseTimestampSummary(result.results || '');
        
        // Create chapters from the parsed timestamps
        const { prisma } = await import('~/utils/db.server');
        
        // Update the course with the file path and processing results
        await updateCourse(course.id, { 
          textContent: result.results,
          processingType: 'ai' as const
        });
        
        // Create chapters from the parsed timestamps
        if (parsed.groups.length > 0) {
          await prisma.chapter.createMany({
            data: parsed.groups.flatMap((group: ParsedGroup, groupIndex: number) => 
              group.items.map((item: ParsedItem, itemIndex: number) => ({
                courseId: course.id,
                title: item.title,
                description: item.desc || '',
                startTime: item.start,
                endTime: group.items[itemIndex + 1]?.start || null,
                order: groupIndex * 100 + itemIndex,
                sourceType: 'ai' as const,
                contentType: 'video' as const,
              }))
            )
          });
        }
        
        return redirect(`/dashboard/courses/${course.id}?created=1`);
      }
      
      if (contentType === 'uploaded_audio') {
        if (!audioFile || !(audioFile instanceof File)) {
          return json({ error: "Audio file is required" }, { status: 400 });
        }
        
        const course = await createCourse({ 
          title, 
          contentType: contentType as any, 
          description, 
          createdById: user.id 
        });
        
        const result = await processAudio(audioFile, 'segmentation'); 
        
        if (!result.results) {
          throw new Error("Failed to process audio content");
        }
        
        const parsed = parseTimestampSummary(result.results || '');
        
        const { prisma } = await import('~/utils/db.server');
        
        await updateCourse(course.id, { 
          textContent: result.results,
          processingType: 'ai' as const
        });
        
        if (parsed.groups.length > 0) {
          await prisma.chapter.createMany({
            data: parsed.groups.flatMap((group: ParsedGroup, groupIndex: number) => 
              group.items.map((item: ParsedItem, itemIndex: number) => ({
                courseId: course.id,
                title: item.title,
                description: item.desc || '',
                startTime: item.start,
                endTime: group.items[itemIndex + 1]?.start || null,
                order: groupIndex * 100 + itemIndex,
                sourceType: 'ai' as const,
                contentType: 'audio' as const,
              }))
            )
          });
        }
        
        return redirect(`/dashboard/courses/${course.id}?created=1`);
      }
      
      // For non-video content types
      await createCourse({ 
        title, 
        contentType: contentType as any, 
        description, 
        createdById: user.id 
      });
      return redirect("/dashboard/courses?updated=1");
    }

    if (intent === "update") {
      const id = String(form.get("id") || "");
      const title = String(form.get("title") || "").trim();
      if (!id) return json({ error: "Missing course id" }, { status: 400 });
      if (!title) {
        return json({ error: "Title is required" }, { status: 400 });
      }
      // Do not allow updating contentType via the form; it is determined by the app
      await updateCourse(id, { title });
      return redirect("/dashboard/courses?updated=1");
    }

    if (intent === "delete") {
      const id = String(form.get("id") || "");
      if (!id) return json({ error: "Missing course id" }, { status: 400 });
      await deleteCourse(id);
      // If submitted via fetcher (ajax), return JSON to avoid navigation/scroll
      const isAjax = String(form.get("_ajax") || "") === "1";
      if (isAjax) return json({ ok: true, id });
      return redirect("/dashboard/courses?updated=1");
    }

    return json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return json({ error: e?.message || "Operation failed" }, { status: 400 });
  }
}

const CONTENT_TYPES = [
  { value: "youtube_playlist", label: "YouTube Playlist" },
  { value: "youtube_video", label: "YouTube Video" },
  { value: "uploaded_video", label: "Uploaded Video" },
  { value: "uploaded_audio", label: "Uploaded Audio" },
  { value: "pdf_textbook", label: "PDF Textbook" }
];

export default function CoursesDashboard() {
  const { courses, updated, noChapters } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const deleteFetcher = useFetcher<any>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const location = useLocation();
  const [showToast, setShowToast] = useState<boolean>(!!updated);
  const [toastMsg, setToastMsg] = useState<string>("");
  const [showError, setShowError] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const toastTimeoutRef = useRef<number | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const lastDeleteHandledRef = useRef<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const filteredCourses = useMemo(() => {
    const normalize = (s: string) =>
      (s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");

    const subseq = (q: string, t: string) => {
      // true if all chars in q appear in order in t
      if (!q) return true;
      let i = 0;
      for (let j = 0; j < t.length && i < q.length; j++) {
        if (t[j] === q[i]) i++;
      }
      return i === q.length;
    };

    const wordStart = (q: string, t: string) => {
      if (!q) return true;
      const words = t.split(/[^a-z0-9]+/g).filter(Boolean);
      return words.some((w) => w.startsWith(q));
    };

    const qRaw = search.trim();
    if (!qRaw) return courses;
    const qNorm = normalize(qRaw);
    const tokens = qNorm.split(/\s+/).filter(Boolean);

    // If query looks like a phrase (multi-word or long), prefer strict phrase includes
    const phraseEligible = qNorm.length >= 5 || qRaw.includes(" ");
    if (phraseEligible) {
      // First, restrict to TITLE-only phrase matches
      const titlePhraseMatches = courses.filter((c: any) => normalize(c.title).includes(qNorm));
      if (titlePhraseMatches.length > 0) return titlePhraseMatches;
      // Fallback: allow phrase across broader fields
      const phraseMatches = courses.filter((c: any) => {
        const title = normalize(c.title);
        const desc = normalize(c.description);
        const typeLabel = normalize(
          CONTENT_TYPES.find((ct) => ct.value === c.contentType)?.label || c.contentType
        );
        const youtuber = normalize((c as any).youtuberName);
        const channel = normalize((c as any).channelName);
        const author = normalize((c as any).authorName);
        const src = normalize((c as any).sourceUrl);
        const id = normalize((c as any).id);
        const hay = [title, desc, typeLabel, youtuber, channel, author, src, id].filter(Boolean) as string[];
        return hay.some((h) => h.includes(qNorm));
      });
      if (phraseMatches.length > 0) return phraseMatches;
    }

    return courses.filter((c: any) => {
      const title = normalize(c.title);
      const desc = normalize(c.description);
      const typeLabel = normalize(
        CONTENT_TYPES.find((ct) => ct.value === c.contentType)?.label || c.contentType
      );
      const youtuber = normalize((c as any).youtuberName);
      const channel = normalize((c as any).channelName);
      const author = normalize((c as any).authorName);
      const src = normalize((c as any).sourceUrl);
      const id = normalize((c as any).id);

      const hayOther = [desc, typeLabel, youtuber, channel, author, src, id].filter(Boolean) as string[];

      // every token must match: prioritize TITLE (includes/wordStart/fuzzy>=4).
      // Other fields are allowed by strict includes only (no fuzzy) to reduce noise.
      return tokens.every((tok) =>
        title.includes(tok) ||
        wordStart(tok, title) ||
        (tok.length >= 4 && subseq(tok, title)) ||
        hayOther.some((h) => h.includes(tok))
      );
    });
  }, [search, courses]);

  useEffect(() => {
    if (updated) {
      setToastMsg("Changes saved.");
      setShowToast(true);
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = window.setTimeout(() => setShowToast(false), 2500);
      // Strip ?updated=1 from URL so refresh doesn't retrigger toast
      const params = new URLSearchParams(location.search);
      if (params.has("updated")) {
        params.delete("updated");
        const qs = params.toString();
        navigate(qs ? `${location.pathname}?${qs}` : location.pathname, { replace: true });
      }
      return () => {
        if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      };
    } else {
      setShowToast(false);
    }
  }, [updated, navigate, location.pathname, location.search]);

  // React to delete fetcher results for immediate toasts and list refresh
  useEffect(() => {
    const data: any = deleteFetcher.data;
    if (deleteFetcher.state === "idle" && data?.ok && data?.id) {
      const key = `ok:${data.id}`;
      if (lastDeleteHandledRef.current !== key) {
        lastDeleteHandledRef.current = key;
        setToastMsg("Course deleted.");
        setShowToast(true);
        if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = window.setTimeout(() => setShowToast(false), 2500);
        revalidator.revalidate();
      }
    }
    if (deleteFetcher.state === "idle" && data?.error) {
      const key = `err:${String(data.error)}`;
      if (lastDeleteHandledRef.current !== key) {
        lastDeleteHandledRef.current = key;
        setErrorMsg(String(data.error));
        setShowError(true);
        if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = window.setTimeout(() => setShowError(false), 3500);
      }
    }
  }, [deleteFetcher.state, deleteFetcher.data, revalidator]);

  useEffect(() => {
    const msg = (actionData as any)?.error as string | undefined;
    if (msg) {
      setErrorMsg(msg);
      setShowError(true);
      if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = window.setTimeout(() => setShowError(false), 3500);
      return () => {
        if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
      };
    }
  }, [actionData]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manage Courses</h2>
        <Button variant="primary" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : 'Create a New Course'}
        </Button>
      </div>
      
      {/* Success toast */}
      {showToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto inline-flex items-start gap-3 rounded-md border border-success-border bg-success-bg p-3 text-sm text-success-text shadow-lg"
        >
          <div className="mt-0.5">✅</div>
          <div className="pr-1">{toastMsg || "Changes saved."}</div>
          <button
            type="button"
            aria-label="Dismiss"
            className="ml-1 rounded px-1 text-success-text/70 hover:text-success-text focus:outline-none focus:ring-2 focus:ring-success-border"
            onClick={() => setShowToast(false)}
          >
            ×
          </button>
        </div>
      )}

      {/* Error toast */}
      {showError && (
        <div
          role="alert"
          aria-live="assertive"
          className="pointer-events-auto inline-flex items-start gap-3 rounded-md border border-error-border bg-error-bg p-3 text-sm text-error-text shadow-lg"
        >
          <div className="mt-0.5">⚠️</div>
          <div className="pr-1">{errorMsg || "Operation failed."}</div>
          <button
            type="button"
            aria-label="Dismiss error"
            className="ml-1 rounded px-1 text-error-text/70 hover:text-error-text focus:outline-none focus:ring-2 focus:ring-error-border"
            onClick={() => setShowError(false)}
          >
            ×
          </button>
        </div>
      )}
      
      {noChapters && (
        <p className="rounded border border-warn-border bg-warn-bg p-3 text-sm text-warn-text">
          Chapter-based segmentation was selected, but no timestamps were found in the video description (or the API key is missing). No course was created. Try Manual (paste timestamps) or add timestamps to the description.
        </p>
      )}

      {showCreateForm && (
        <div className="rounded border border-subtle-border p-6">
          <h3 className="font-medium">Create a new course</h3>
          <Form method="post" className="mt-4 space-y-4">
            <input type="hidden" name="_intent" value="create" />
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-main-text">Title</label>
              <input type="text" name="title" id="title" className="mt-1 block w-full rounded-md border-main-border shadow-sm focus:border-main-accent focus:ring-main-accent sm:text-sm" />
            </div>
            <div>
              <label htmlFor="contentType" className="block text-sm font-medium text-main-text">Content Type</label>
              <select name="contentType" id="contentType" className="mt-1 block w-full rounded-md border-main-border shadow-sm focus:border-main-accent focus:ring-main-accent sm:text-sm" onChange={(e) => setShowVideoUpload(e.target.value === 'uploaded_video')}>
                {CONTENT_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}              </select>
            </div>
            {showVideoUpload && (
              <div>
                <label htmlFor="videoFile" className="block text-sm font-medium text-main-text">Video File</label>
                <input type="file" name="videoFile" id="videoFile" className="mt-1 block w-full text-sm text-main-text file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-main-accent file:text-button-text hover:file:bg-main-accent/90" />
              </div>
            )}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-main-text">Description</label>
              <textarea name="description" id="description" rows={3} className="mt-1 block w-full rounded-md border-main-border shadow-sm focus:border-main-accent focus:ring-main-accent sm:text-sm"></textarea>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Create Course</Button>
            </div>
          </Form>
        </div>
      )}

      <div className="rounded border border-subtle-border p-6">
        <h3 className="font-medium">Search courses</h3>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, description, or type"
            aria-label="Search courses"
            className="w-full rounded border border-main-border bg-main-bg p-3 text-sm"
          />
          {search && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearch("")}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {(search ? filteredCourses.length === 0 : courses.length === 0) && (
          <p className="py-6 text-sm opacity-70">{search ? "No matching courses." : "No courses yet."}</p>
        )}
        {filteredCourses.map((c: any) => (
          <div key={c.id} className="rounded border border-subtle-border p-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <Form method="post" className="grid gap-4 flex-1 min-w-0">
              <input type="hidden" name="_intent" value="update" />
              <input type="hidden" name="id" value={c.id} />
              <label className="text-sm">
                <input aria-label="Title" name="title" defaultValue={c.title} className="w-full rounded border border-main-border bg-main-bg p-3 text-sm" />
                <span className="mt-1 block text-xs opacity-70">
                  <span className="opacity-80">Content Type:</span>{" "}
                  {CONTENT_TYPES.find((ct) => ct.value === c.contentType)?.label ?? c.contentType}
                </span>
              </label>
              <div className="sm:col-span-2 flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/dashboard/courses/${c.id}`}>View</Link>
                </Button>
                <Button variant="primary" size="sm">Update</Button>
              </div>
            </Form>
            <deleteFetcher.Form method="post">
              <input type="hidden" name="_intent" value="delete" />
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="_ajax" value="1" />
              <Button variant="outline" size="sm" className="border-error-border text-error-text hover:bg-error-bg">
                Delete
              </Button>
            </deleteFetcher.Form>
          </div>
        ))}
      </div>
    </div>
  );
}