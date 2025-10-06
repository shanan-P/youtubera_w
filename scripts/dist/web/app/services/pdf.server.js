"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPdfStorageDir = getPdfStorageDir;
exports.getPdfFilePath = getPdfFilePath;
exports.getTxtStorageDir = getTxtStorageDir;
exports.getTxtFilePath = getTxtFilePath;
exports.saveTxtFromUrl = saveTxtFromUrl;
exports.saveUploadedPdf = saveUploadedPdf;
exports.extractText = extractText;
exports.processPDF = processPDF;
// PDF processing service stubs as per `design.md`
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_module_1 = require("node:module");
const jsdom_1 = require("jsdom");
const readability_1 = require("@mozilla/readability");
const stream_1 = require("stream");
const pdfservices_node_sdk_1 = require("@adobe/pdfservices-node-sdk");
async function ensureDir(dir) {
    await promises_1.default.mkdir(dir, { recursive: true });
}
// Use CommonJS require to load pdf-parse so that module.parent is defined
// inside the library, preventing its debug path from reading a test PDF file.
const require = (0, node_module_1.createRequire)(node_path_1.default.join(process.cwd(), "package.json"));
const pdfParse = require("pdf-parse");
function getPdfStorageDir(courseId) {
    return node_path_1.default.join(process.cwd(), "public", "downloads", "pdfs", courseId);
}
function getPdfFilePath(courseId) {
    return node_path_1.default.join(getPdfStorageDir(courseId), "source.pdf");
}
function getTxtStorageDir(courseId) {
    return node_path_1.default.join(process.cwd(), "public", "downloads", "texts", courseId);
}
function getTxtFilePath(courseId) {
    return node_path_1.default.join(getTxtStorageDir(courseId), "source.txt");
}
async function createPdfFromHtml(htmlContent, outputPath) {
    let readStream;
    try {
        const credentials = new pdfservices_node_sdk_1.ServicePrincipalCredentials({
            clientId: process.env.PDF_SERVICES_CLIENT_ID,
            clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET,
        });
        const pdfServices = new pdfservices_node_sdk_1.PDFServices({ credentials });
        readStream = stream_1.Readable.from(htmlContent);
        const inputAsset = await pdfServices.upload({
            readStream,
            mimeType: pdfservices_node_sdk_1.MimeType.HTML,
        });
        const params = new pdfservices_node_sdk_1.HTMLToPDFParams({
            pageLayout: new pdfservices_node_sdk_1.PageLayout({ pageHeight: 25, pageWidth: 20 }),
            includeHeaderFooter: true,
        });
        const job = new pdfservices_node_sdk_1.HTMLToPDFJob({ inputAsset, params });
        const pollingURL = await pdfServices.submit({ job });
        const pdfServicesResponse = await pdfServices.getJobResult({
            pollingURL,
            resultType: pdfservices_node_sdk_1.HTMLToPDFResult,
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
    }
    catch (err) {
        if (err instanceof pdfservices_node_sdk_1.SDKError ||
            err instanceof pdfservices_node_sdk_1.ServiceUsageError ||
            err instanceof pdfservices_node_sdk_1.ServiceApiError) {
            console.log("Exception encountered while executing operation", err);
        }
        else {
            console.log("Exception encountered while executing operation", err);
        }
        throw err;
    }
    finally {
        readStream?.destroy();
    }
}
async function saveTxtFromUrl(url, courseId) {
    console.log(`[saveTxtFromUrl] Starting to process URL: ${url}`);
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
        await promises_1.default.writeFile(pdfPath, buf);
        console.log(`[saveTxtFromUrl] Saved temporary PDF to ${pdfPath}, extracting text.`);
        const { text } = await extractText(pdfPath);
        textContent = text;
        console.log(`[saveTxtFromUrl] Extracted ${textContent.length} characters from PDF.`);
        // clean up the temp pdf
        await promises_1.default.unlink(pdfPath);
    }
    else if (contentType.includes("text/html") || !contentType) {
        console.log('[saveTxtFromUrl] Content is HTML, attempting to extract article.');
        const html = await res.text();
        const doc = new jsdom_1.JSDOM(html, { url });
        const reader = new readability_1.Readability(doc.window.document);
        const article = reader.parse();
        if (article && article.textContent) {
            textContent = article.textContent;
            console.log(`[saveTxtFromUrl] Readability extracted article successfully. Length: ${textContent.length}`);
        }
        else {
            console.warn('[saveTxtFromUrl] Readability failed to extract article or article is empty. Using empty content.');
            textContent = '';
        }
    }
    else {
        console.warn(`[saveTxtFromUrl] Unsupported content type: ${contentType}. Trying to read as text.`);
        try {
            textContent = await res.text();
        }
        catch (e) {
            console.error(`[saveTxtFromUrl] Could not read content as text for unsupported type: ${contentType}`, e);
            textContent = '';
        }
    }
    // Now, save the textContent to a .txt file.
    console.log(`[saveTxtFromUrl] Saving extracted text to .txt file.`);
    const txtDir = getTxtStorageDir(courseId);
    await ensureDir(txtDir);
    const txtAbsPath = getTxtFilePath(courseId);
    await promises_1.default.writeFile(txtAbsPath, textContent);
    const txtRelPath = node_path_1.default.posix.join("/downloads", "texts", courseId, "source.txt");
    console.log(`[saveTxtFromUrl] Saved text file to ${txtAbsPath}`);
    return { absPath: txtAbsPath, relPath: txtRelPath, content: textContent };
}
async function saveUploadedPdf(file, courseId) {
    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const dir = getPdfStorageDir(courseId);
    await ensureDir(dir);
    const absPath = getPdfFilePath(courseId);
    await promises_1.default.writeFile(absPath, buf);
    const relPath = node_path_1.default.posix.join("/downloads", "pdfs", courseId, "source.pdf");
    return { absPath, relPath };
}
async function extractText(pdfPath) {
    const data = await promises_1.default.readFile(pdfPath);
    const parsed = await pdfParse(data);
    const text = parsed.text || "";
    const numpages = parsed.numpages ?? undefined;
    const title = parsed.info?.Title;
    return { text, numpages, title };
}
async function processPDF(pdfSource) {
    const id = `pdf_${Date.now()}`;
    return { id, status: "processing", progress: 0 };
}
