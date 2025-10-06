// This is the entry point for the server-side application.
// It handles the server-side rendering of the React application.
import type { EntryContext } from "@remix-run/node";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import ReactDOMServer from "react-dom/server";
import { PassThrough } from "node:stream";
import { isbot } from "isbot";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  const ABORT_DELAY = 5000;
  const ua = request.headers.get("user-agent") ?? "";
  const bot = isbot(ua);

  return await new Promise<Response>((resolve, reject) => {
    let didError = false;

    const stream = ReactDOMServer.renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onShellReady() {
          if (bot) return; // wait for all ready for bots
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              status: didError ? 500 : responseStatusCode,
              headers: responseHeaders
            })
          );
          stream.pipe(body);
        },
        onAllReady() {
          if (!bot) return; // stream as soon as shell is ready for browsers
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              status: didError ? 500 : responseStatusCode,
              headers: responseHeaders
            })
          );
          stream.pipe(body);
        },
        onShellError(error: unknown) {
          reject(error as any);
        },
        onError(error: unknown) {
          didError = true;
          console.error(error);
        }
      }
    );

    // In case something goes wrong before we start streaming
    setTimeout(() => stream.abort(), ABORT_DELAY);
  });
}