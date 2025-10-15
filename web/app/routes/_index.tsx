import { Form, Link, redirect, useNavigation } from "@remix-run/react";
import { Button } from "~/components/Button";
import type { ActionFunctionArgs, UploadHandler } from "@remix-run/node";
import { json, unstable_composeUploadHandlers, unstable_createFileUploadHandler, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData } from "@remix-run/node";
import { createCourseFromUrl, createCourseFromSource } from "~/services/course.server";
import { getUserId } from "~/utils/auth.server";
import { useState, useMemo } from "react";

export async function action({ request }: ActionFunctionArgs) {
  console.log("--- ENTERING action function ---");
  const userId = await getUserId(request);
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("multipart/form-data")) {
    // Handle file upload
    const uploadHandler: UploadHandler = unstable_composeUploadHandlers(
      unstable_createFileUploadHandler({
        directory: "public/uploads",
        maxPartSize: 500_000_000, // 500MB
        file: ({ filename }) => filename,
        filter: ({ name }) => name === "file",
      }),
      // parse everything else into memory
      unstable_createMemoryUploadHandler()
    );
    const formData = await unstable_parseMultipartFormData(request, uploadHandler);
    const file = formData.get("file");
    const fileType = formData.get("fileType");
    console.log("--- formData fileType ---", fileType);

    if (!file || typeof file === "string") {
      return json({ error: "File not provided" }, { status: 400 });
    }

    let audioProcessing: "segmentation" | "reading" | undefined = undefined;
    if (fileType === "audio-segmentation") {
      audioProcessing = "segmentation";
    } else if (fileType === "audio-transcript") {
      audioProcessing = "reading";
    }

    const result = await createCourseFromSource(
      { type: "file", file, fileType: fileType as string, audioProcessing },
      userId ?? undefined
    );

    if (result.error) {
      return json({ error: result.error }, { status: 500 });
    }

    if (!result.courseId) {
      return json({ error: "Failed to create course" }, { status: 500 });
    }

    return redirect(`/dashboard/courses/${result.courseId}`);
  } else {
    // Handle URL submission
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
}

export default function Index() {
  const navigation = useNavigation();
  const isCreating = navigation.state === "submitting";
  const [processingType, setProcessingType] = useState("ai");
  const [formType, setFormType] = useState<"url" | "file">("url");
  const [fileType, setFileType] = useState("pdf");
  const [url, setUrl] = useState(""); // State for URL input

  const isYoutubeUrl = useMemo(() => {
    if (!url) return false;
    return url.includes("youtube.com") || url.includes("youtu.be");
  }, [url]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center">
      <h1 className="text-5xl font-bold">Welcome to Youtubera</h1>
      <p className="mt-4 text-lg text-sub-text">
        Your personal learning assistant. Paste a URL or upload a file to get started.
      </p>

      <div className="mt-8 w-full max-w-2xl">
        <div className="flex justify-center border-b border-gray-300">
          <button
            className={`px-4 py-2 text-lg font-medium ${formType === "url" ? "border-b-2 border-primary text-primary" : "text-sub-text"}`}
            onClick={() => setFormType("url")}
          >
            Create from URL
          </button>
          <button
            className={`px-4 py-2 text-lg font-medium ${formType === "file" ? "border-b-2 border-primary text-primary" : "text-sub-text"}`}
            onClick={() => setFormType("file")}
          >
            Upload a File
          </button>
        </div>

        {formType === "url" ? (
          <Form method="post" className="mt-8 flex flex-col gap-4">
            <input type="hidden" name="submissionType" value="url" />
            <div className="flex gap-2">
              <input
                type="url"
                name="url"
                placeholder="Enter a YouTube URL or any other URL"
                className="w-full rounded-md border-gray-300 bg-subtle-bg px-4 py-2 text-lg text-text focus:border-primary focus:ring-primary"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button type="submit" size="lg" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Course"}
              </Button>
            </div>
            {isYoutubeUrl && (
              <>
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
                    className="w-full h-32 rounded-md border-gray-300 bg-subtle-bg px-4 py-2 text-text focus:border-primary focus:ring-primary"
                  />
                )}
              </>
            )}
          </Form>
        ) : (
          <Form method="post" encType="multipart/form-data" className="mt-8 flex flex-col gap-4">
            <input type="hidden" name="submissionType" value="file" />
            <div className="flex flex-col items-center gap-4">
              <input
                type="file"
                name="file"
                className="w-full rounded-md border-gray-300 bg-subtle-bg px-4 py-2 text-lg text-text focus:border-primary focus:ring-primary"
                required
              />
              <div className="flex items-center justify-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="fileType"
                    value="pdf"
                    checked={fileType === "pdf"}
                    onChange={(e) => setFileType(e.target.value)}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <span>PDF</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="fileType"
                    value="video"
                    checked={fileType === "video"}
                    onChange={(e) => setFileType(e.target.value)}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <span>Video</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="fileType"
                    value="audio-segmentation"
                    checked={fileType === "audio-segmentation"}
                    onChange={(e) => setFileType(e.target.value)}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <span>Audio (Segmented)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="fileType"
                    value="audio-transcript"
                    checked={fileType === "audio-transcript"}
                    onChange={(e) => setFileType(e.target.value)}
                    className="h-4 w-4 text-primary focus:ring-primary"
                  />
                  <span>Audio (Transcript)</span>
                </label>
              </div>
              <Button type="submit" size="lg" disabled={isCreating}>
                {isCreating ? "Uploading..." : "Upload and Create"}
              </Button>
            </div>
          </Form>
        )}
      </div>

      <div className="mt-8">
        <p className="text-sub-text">Or</p>
        <Button asChild size="lg" variant="secondary" className="mt-4">
          <Link to="/login">Login to Your Account</Link>
        </Button>
      </div>
    </div>
  );
}