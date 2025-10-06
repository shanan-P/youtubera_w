import {
  json,
  unstable_composeUploadHandlers,
  unstable_createFileUploadHandler,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { processVideo } from "~/services";
import { useState } from "react";

export async function action({ request }: ActionFunctionArgs) {
  const uploadHandler = unstable_createFileUploadHandler({
      directory: "public/uploads",
      maxPartSize: 500_000_000, // 500MB
      file: ({ filename }) => filename,
    });

  const formData = await unstable_parseMultipartFormData(request, uploadHandler);
  const file = formData.get("video-file");

  if (!file || typeof file === "string") {
    return json({ error: "File not provided" }, { status: 400 });
  }

  const result = await processVideo(file, "ai");

  return json(result);
}

export default function TestUploadPage() {
  const actionData = useActionData<typeof action>();
  const [fileName, setFileName] = useState('');

  const handleFileChange = (event: any) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
    } else {
      setFileName('');
    }
  };


  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Test Video Upload</h1>
      <Form method="post" encType="multipart/form-data">
        <label>
          Video File:
          <input type="file" name="video-file" accept="video/mp4" onChange={handleFileChange} />
        </label>
        <p>
            <button type="submit" disabled={!fileName}>Upload</button>
        </p>
      </Form>

      {fileName && <p>Selected file: {fileName}</p>}

      {actionData && (
        <div>
          <h2>Processing Result</h2>
          <pre>{JSON.stringify(actionData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}