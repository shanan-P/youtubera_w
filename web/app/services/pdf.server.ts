// PDF processing service stubs as per `design.md`
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { Readable } from "stream";
import {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  HTMLToPDFJob,
  HTMLToPDFResult,
  PageLayout,
  HTMLToPDFParams,
  SDKError,
  ServiceUsageError,
  ServiceApiError,
} from "@adobe/pdfservices-node-sdk";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

// Use CommonJS require to load pdf-parse so that module.parent is defined
// inside the library, preventing its debug path from reading a test PDF file.
const require = createRequire(path.join(process.cwd(), "package.json"));
const pdfParse: any = require("pdf-parse");

export function getPdfStorageDir(courseId: string) {
  return path.join(process.cwd(), "public", "downloads", "pdfs", courseId);
}

export function getPdfFilePath(courseId: string) {
  return path.join(getPdfStorageDir(courseId), "source.pdf");
}

export function getTxtStorageDir(courseId: string) {
  return path.join(process.cwd(), "public", "downloads", "texts", courseId);
}

export function getTxtFilePath(courseId: string) {
  return path.join(getTxtStorageDir(courseId), "source.txt");
}

export async function createPdfFromHtml(htmlContent: string, outputPath: string, theme: string) {
  let readStream: Readable | undefined;
  try {
    const themeClass = theme === 'dark' ? 'dark' : 'light';
    const themedHtml = `
      <html class="${themeClass}">
        <head>
          <style>
            /* Add your theme-specific styles here */
          </style>
        </head>
        <body>
          <div class="prose dark:prose-invert">
            ${htmlContent}
          </div>
        </body>
      </html>
    `;
    const credentials = new ServicePrincipalCredentials({
      clientId: process.env.PDF_SERVICES_CLIENT_ID!,
      clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET!,
    });

    const pdfServices = new PDFServices({ credentials });
    readStream = Readable.from(htmlContent);

    const inputAsset = await pdfServices.upload({
      readStream,
      mimeType: MimeType.HTML,
    });

    const params = new HTMLToPDFParams({
      pageLayout: new PageLayout({ pageHeight: 25, pageWidth: 20 }),
      includeHeaderFooter: true,
    });

    const job = new HTMLToPDFJob({ inputAsset, params });
    const pollingURL = await pdfServices.submit({ job });
    const pdfServicesResponse = await pdfServices.getJobResult({
      pollingURL,
      resultType: HTMLToPDFResult,
    });

    const resultAsset = pdfServicesResponse.result?.asset;
    if (!resultAsset) {
      throw new Error("PDF Services did not return a result asset.");
    }
    const streamAsset = await pdfServices.getContent({ asset: resultAsset });

    const outputStream = require("fs").createWriteStream(outputPath);
    await new Promise((resolve, reject) => {
      streamAsset.readStream.pipe(outputStream).on("finish", resolve).on("error", reject);
    });
  } catch (err) {
    if (
      err instanceof SDKError ||
      err instanceof ServiceUsageError ||
      err instanceof ServiceApiError
    ) {
      console.log("Exception encountered while executing operation", err);
    } else {
      console.log("Exception encountered while executing operation", err);
    }
    throw err;
  } finally {
    readStream?.destroy();
  }
}

export async function saveTxtFromUrl(url: string, courseId: string): Promise<{ absPath: string; relPath: string, content: string }> {
  console.log(`[saveTxtFromUrl] Starting to process URL: ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  console.log(`[saveTxtFromUrl] Fetched URL with status: ${res.status}`);
  if (!res.ok) {
    console.error(`[saveTxtFromUrl] Failed to download content from URL (${res.status})`);
    throw new Error(`Failed to download content from URL (${res.status})`);
  }

  const contentType = res.headers.get("content-type") || "";
  console.log(`[saveTxtFromUrl] Content-Type: ${contentType}`);

  let textContent = '';

  if (contentType.includes("application/pdf")) {
    console.log('[saveTxtFromUrl] Content is PDF, downloading and extracting text.');
    const dir = getPdfStorageDir(courseId); // temp dir for pdf
    await ensureDir(dir);
    const pdfPath = getPdfFilePath(courseId);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(pdfPath, buf);
    
    console.log(`[saveTxtFromUrl] Saved temporary PDF to ${pdfPath}, extracting text.`);
    const { text } = await extractText(pdfPath);
    textContent = text;
    console.log(`[saveTxtFromUrl] Extracted ${textContent.length} characters from PDF.`);
    // clean up the temp pdf
    await fs.unlink(pdfPath);

  } else if (contentType.includes("text/html") || !contentType) {
    console.log('[saveTxtFromUrl] Content is HTML, attempting to extract article.');
    const html = await res.text();
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (article && article.textContent) {
      textContent = article.textContent;
      console.log(`[saveTxtFromUrl] Readability extracted article successfully. Length: ${textContent.length}`);
    } else {
      console.warn('[saveTxtFromUrl] Readability failed to extract article or article is empty. Using empty content.');
      textContent = '';
    }
  } else {
    console.warn(`[saveTxtFromUrl] Unsupported content type: ${contentType}. Trying to read as text.`);
    try {
      textContent = await res.text();
    } catch (e) {
      console.error(`[saveTxtFromUrl] Could not read content as text for unsupported type: ${contentType}`, e);
      textContent = '';
    }
  }

  // Now, save the textContent to a .txt file.
  console.log(`[saveTxtFromUrl] Saving extracted text to .txt file.`);
  const txtDir = getTxtStorageDir(courseId);
  await ensureDir(txtDir);
  const txtAbsPath = getTxtFilePath(courseId);
  await fs.writeFile(txtAbsPath, textContent);
  const txtRelPath = path.posix.join("/downloads", "texts", courseId, "source.txt");
  console.log(`[saveTxtFromUrl] Saved text file to ${txtAbsPath}`);

  return { absPath: txtAbsPath, relPath: txtRelPath, content: textContent };
}

export async function saveUploadedPdf(file: File, courseId:string) {
  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const dir = getPdfStorageDir(courseId);
  await ensureDir(dir);
  const absPath = getPdfFilePath(courseId);
  await fs.writeFile(absPath, buf);
  const relPath = path.posix.join("/downloads", "pdfs", courseId, "source.pdf");
  return { absPath, relPath };
}

export async function extractText(pdfPath: string) {
  const data = await fs.readFile(pdfPath);
  const parsed = await pdfParse(data);
  const text = parsed.text || "";
  const numpages = (parsed.numpages as number | undefined) ?? undefined;
  const title = (parsed.info as any)?.Title as string | undefined;
  return { text, numpages, title };
}

export async function processPDF(pdfSource: File | string) {
  const id = `pdf_${Date.now()}`;
  return { id, status: "processing", progress: 0 } as const;
}