// PDF processing service stubs as per `design.md`
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { Readability, isProbablyReaderable } from "@mozilla/readability";
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
import { extractTextFromPdfWithAdobe } from "./adobe-extract.server";

interface ReadabilityArticle {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string;
  dir: string;
  siteName: string;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

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

export async function saveTxtFromUrl(url: string, courseId: string): Promise<{ absPath: string; relPath: string, content: string, article: ReadabilityArticle | null }> {
  console.log(`[saveTxtFromUrl] Starting to process URL: ${url}`);

  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[saveTxtFromUrl] Attempt ${attempt}/${maxRetries} - Fetching URL`);

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "DNT": "1",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Cache-Control": "max-age=0"
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000) // 30 seconds timeout
      });

      console.log(`[saveTxtFromUrl] Fetched URL with status: ${res.status}`);
      if (!res.ok) {
        if (attempt === maxRetries) {
          console.error(`[saveTxtFromUrl] Failed to download content from URL after ${maxRetries} attempts (${res.status})`);
          throw new Error(`Failed to download content from URL (${res.status})`);
        }
        console.log(`[saveTxtFromUrl] Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      console.log(`[saveTxtFromUrl] Content-Type: ${contentType}`);

      let textContent = '';
      let article: ReadabilityArticle | null = null;

      if (contentType.includes("application/pdf")) {
        console.log('[saveTxtFromUrl] Content is PDF, downloading and extracting text.');
        const dir = getPdfStorageDir(courseId);
        await ensureDir(dir);
        const pdfPath = getPdfFilePath(courseId);
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(pdfPath, buf);

        console.log(`[saveTxtFromUrl] Saved temporary PDF to ${pdfPath}, extracting text with Adobe.`);
        const adobeResult = await extractTextFromPdfWithAdobe(pdfPath);

        if (adobeResult.error) {
          console.error('[saveTxtFromUrl] Adobe extraction failed:', adobeResult.error);
          textContent = "";
        } else {
          textContent = adobeResult.text || "";
        }

        console.log(`[saveTxtFromUrl] Extracted ${textContent.length} characters from PDF using Adobe.`);
        await fs.unlink(pdfPath);

      } else if (contentType.includes("text/html") || !contentType) {
        console.log('[saveTxtFromUrl] Content is HTML, attempting to extract article.');
        const html = await res.text();

        // Add a small delay to allow for any dynamic content loading
        await new Promise(resolve => setTimeout(resolve, 1000));

        const doc = new JSDOM(html, { url });

        // Check if page is readable with more lenient criteria
        const isReadable = isProbablyReaderable(doc.window.document) ||
          doc.window.document.querySelector('article') !== null ||
          doc.window.document.querySelector('.article-content') !== null ||
          doc.window.document.querySelector('.post-content') !== null ||
          doc.window.document.querySelector('main') !== null;

        console.log(`[saveTxtFromUrl] Is page probably readable? ${isReadable}`);

        if (isReadable) {
          // Configure Readability with better options for technical articles
          const reader = new Readability(doc.window.document, {
            // Try to preserve more content
            charThreshold: 100,
            // Better handling of code blocks and formatting
            classesToPreserve: ['highlight', 'code', 'pre', 'syntax-highlight', 'prettyprint']
          });
          article = reader.parse() as ReadabilityArticle;
        }

        if (article && article.content && article.content.trim().length > 200) {
          textContent = article.content; // Keep HTML content for formatting
          console.log(`[saveTxtFromUrl] Readability extracted article successfully. Length: ${textContent.length}`);
          console.log(`[saveTxtFromUrl] Title: ${article.title || 'No title extracted'}`);
        } else {
          console.warn('[saveTxtFromUrl] Readability failed or content too short, using fallback extraction.');
          textContent = await extractContentWithFallback(doc, url);
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

      // If after all attempts, textContent is still empty or too short, we consider it a failure for this attempt.
      if (!textContent || textContent.trim().length < 100) {
        console.warn(`[saveTxtFromUrl] Attempt ${attempt} failed: Extracted content is too short or empty.`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue; // Move to the next retry attempt
        } else {
          throw new Error('Failed to extract meaningful content from URL after multiple retries.');
        }
      }

      // Clean up the extracted content
      textContent = cleanExtractedContent(textContent);

      // Now, save the textContent to a .txt file.
      const txtDir = getTxtStorageDir(courseId);
      await ensureDir(txtDir);
      const txtAbsPath = getTxtFilePath(courseId);
      console.log(`[saveTxtFromUrl] Saving extracted text (length: ${textContent.length}) to ${txtAbsPath}`);
      await fs.writeFile(txtAbsPath, textContent);
      const txtRelPath = path.posix.join("/downloads", "texts", courseId, "source.txt");
      console.log(`[saveTxtFromUrl] Saved text file to ${txtAbsPath}`);

      return { absPath: txtAbsPath, relPath: txtRelPath, content: textContent, article };

    } catch (error) {
      console.error(`[saveTxtFromUrl] Attempt ${attempt} failed:`, error);

      if (attempt === maxRetries) {
        console.error(`[saveTxtFromUrl] All ${maxRetries} attempts failed`);
        throw error;
      }

      console.log(`[saveTxtFromUrl] Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error(`Failed to process URL after ${maxRetries} attempts`);
}

// Fallback content extraction method
async function extractContentWithFallback(doc: any, url: string): Promise<string> {
  console.log('[extractContentWithFallback] Attempting fallback content extraction');

  try {
    // Try multiple selectors for article content
    const contentSelectors = [
      'article',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.content',
      'main',
      '.main-content',
      '.post-body',
      '.article-body',
      '.blog-content',
      '.tutorial-content',
      '.geeksforgeeks-content' // GeeksforGeeks specific
    ];

    for (const selector of contentSelectors) {
      const element = doc.window.document.querySelector(selector);
      if (element && element.innerHTML && element.innerHTML.trim().length > 200) {
        console.log(`[extractContentWithFallback] Found content with selector: ${selector}`);
        return element.innerHTML;
      }
    }

    // Try to find content by common article patterns
    const articleElements = doc.window.document.querySelectorAll('div[class*="article"], div[class*="content"], div[class*="post"]');
    for (const element of articleElements) {
      if (element.innerHTML && element.innerHTML.length > 500) {
        console.log(`[extractContentWithFallback] Found content in div with article-like class`);
        return element.innerHTML;
      }
    }

    // Final fallback: try to extract from body, removing navigation and footer
    const body = doc.window.document.body;
    if (body) {
      // Remove common non-content elements
      const elementsToRemove = body.querySelectorAll('nav, header, footer, .nav, .header, .footer, .sidebar, .advertisement, .ads, script, style');
      for (const el of elementsToRemove) {
        el.remove();
      }

      const remainingContent = body.innerHTML;
      if (remainingContent && remainingContent.length > 200) {
        console.log(`[extractContentWithFallback] Using cleaned body content`);
        return remainingContent;
      }
    }

    console.warn('[extractContentWithFallback] No suitable content found with any method');
    return '';

  } catch (error) {
    console.error('[extractContentWithFallback] Error during fallback extraction:', error);
    return '';
  }
}

// Clean up extracted content
function cleanExtractedContent(content: string): string {
  if (!content) return '';

  return content
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove script and style tags
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    // Clean up common artifacts
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Remove tracking pixels and small images
    .replace(/<img[^>]*width=["']1["'][^>]*>/gi, '')
    .replace(/<img[^>]*height=["']1["'][^>]*>/gi, '')
    // Clean up excessive line breaks
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
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

export async function processPDF(pdfSource: File | string) {
  const id = `pdf_${Date.now()}`;
  return { id, status: "processing", progress: 0 } as const;
}