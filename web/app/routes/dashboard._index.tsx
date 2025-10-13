import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { requireUser, getUserId } from "~/utils/auth.server";
import { Button } from "~/components/Button";
import { createCourseFromUrl } from "~/services/course.server";
import { useState } from "react";

export const meta: MetaFunction = () => ([
  { title: "Dashboard - Youtubera" }
]);

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await getUserId(request);
  const formData = await request.formData();
  const url = formData.get("url");
  const processingType = formData.get("processingType");
  const manualTimestamps = formData.get("manualTimestamps");

  if (typeof url !== "string" || !url) {
    return json({ error: "URL is required" }, { status: 400 });
  }

  let segmentation: "chapter" | "manual" | "audio" = "audio";
  if (processingType === "chapter") {
    segmentation = "chapter";
  } else if (processingType === "manual") {
    segmentation = "manual";
  }

  const result = await createCourseFromUrl(
    url,
    userId ?? undefined,
    processingType === "transcript" ? "youtube_text" : "youtube",
    processingType === "manual" ? (manualTimestamps as string) : undefined,
    segmentation
  );

  if (result.error) {
    return json({ error: result.error }, { status: 500 });
  }

  if (!result.courseId) {
    return json({ error: "Failed to create course" }, { status: 500 });
  }

  return redirect(`/dashboard/courses/${result.courseId}`);
}

export default function DashboardIndex() {
  const { user } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isCreating = navigation.state === "submitting";
  const [processingType, setProcessingType] = useState("ai");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user.profilePicture ? (
            <img src={user.profilePicture} alt="Avatar" className="h-12 w-12 rounded-full object-cover border border-subtle-border" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-subtle-bg" />
          )}
          <div>
            <h2 className="text-xl font-semibold">Welcome, {user.username}</h2>
            <p className="text-sm opacity-70">Role: {user.role}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/profile">Edit profile</Link>
          </Button>
          {!user.isVerified && (
            <Button asChild variant="primary">
              <Link to="/dashboard/verify">Verify as YouTuber</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded border border-subtle-border p-6">
        <h3 className="font-medium">Create a new course</h3>
        <p className="mt-2 text-sm opacity-80">Paste a YouTube URL or any other URL to get started.</p>
        <Form method="post" className="mt-4 flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              type="url"
              name="url"
              placeholder="Enter a URL"
              className="w-full rounded-md border-gray-300 bg-subtle-bg px-4 py-2 text-lg text-text focus:border-primary focus:ring-primary"
              required
            />
            <Button type="submit" size="lg" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Course"}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="processingType"
                value="ai"
                checked={processingType === "ai"}
                onChange={(e) => setProcessingType(e.target.value)}
                className="h-4 w-4 text-primary focus:ring-primary"
              />
              <span>AI Segmentation</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="processingType"
                value="chapter"
                checked={processingType === "chapter"}
                onChange={(e) => setProcessingType(e.target.value)}
                className="h-4 w-4 text-primary focus:ring-primary"
              />
              <span>Chapter Segmentation</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="processingType"
                value="manual"
                checked={processingType === "manual"}
                onChange={(e) => setProcessingType(e.target.value)}
                className="h-4 w-4 text-primary focus:ring-primary"
              />
              <span>Manual Timestamps</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="processingType"
                value="transcript"
                checked={processingType === "transcript"}
                onChange={(e) => setProcessingType(e.target.value)}
                className="h-4 w-4 text-primary focus:ring-primary"
              />
              <span>Transcript</span>
            </label>
          </div>
          {processingType === "manual" && (
            <textarea
              name="manualTimestamps"
              placeholder="Paste timestamps here, e.g., 00:00 Intro\n01:23 Chapter 1"
              className="w-full h-32 rounded-md border-gray-300 bg-subtle-bg px-4 py-2 text-lg text-text focus:border-primary focus:ring-primary"
            />
          )}
        </Form>
      </div>

      <div className="rounded border border-subtle-border p-6">
        <h3 className="font-medium">Getting started</h3>
        <p className="mt-2 text-sm opacity-80">Your dashboard will show your courses, progress, and insights here as features are implemented.</p>
      </div>
    </div>
  );
}