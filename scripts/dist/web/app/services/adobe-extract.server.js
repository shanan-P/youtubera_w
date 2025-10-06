"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromPdfWithAdobe = extractTextFromPdfWithAdobe;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_module_1 = require("node:module");
// Use CommonJS require pattern to interop with CJS SDKs from an ESM project
const require = (0, node_module_1.createRequire)(node_path_1.default.join(process.cwd(), "package.json"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdobeSDK = require("@adobe/pdfservices-node-sdk");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require("adm-zip");
const { ServicePrincipalCredentials, PDFServices, MimeType, ExtractPDFParams, ExtractElementType, ExtractPDFJob, ExtractPDFResult, ExtractRenditionsElementType, SDKError, ServiceUsageError, ServiceApiError, } = AdobeSDK;
async function extractTextFromPdfWithAdobe(pdfPath, opts) {
    const clientId = process.env.PDF_SERVICES_CLIENT_ID || "";
    const clientSecret = process.env.PDF_SERVICES_CLIENT_SECRET || "";
    if (!clientId || !clientSecret) {
        return {
            error: "Adobe PDF Services credentials are not configured. Set PDF_SERVICES_CLIENT_ID and PDF_SERVICES_CLIENT_SECRET in your environment.",
        };
    }
    let readStream = null;
    try {
        const credentials = new ServicePrincipalCredentials({ clientId, clientSecret });
        const pdfServices = new PDFServices({ credentials });
        // Upload the PDF as an asset
        readStream = node_fs_1.default.createReadStream(pdfPath);
        const inputAsset = await pdfServices.upload({ readStream, mimeType: MimeType.PDF });
        // Configure extraction: text + optional renditions (figures/tables)
        const params = new ExtractPDFParams({
            elementsToExtract: [ExtractElementType.TEXT],
            ...(opts?.includeRenditions
                ? { elementsToExtractRenditions: [ExtractRenditionsElementType.FIGURES, ExtractRenditionsElementType.TABLES] }
                : {}),
        });
        const job = new ExtractPDFJob({ inputAsset, params });
        // Submit and poll for result
        const pollingURL = await pdfServices.submit({ job });
        const response = await pdfServices.getJobResult({ pollingURL, resultType: ExtractPDFResult });
        // Download the result zip
        const resultAsset = response.result.resource;
        const streamAsset = await pdfServices.getContent({ asset: resultAsset });
        const zipBuffer = await streamToBuffer(streamAsset.readStream);
        // Parse structuredData.json from the zip
        const zip = new AdmZip(zipBuffer);
        const entry = zip.getEntries().find((e) => /structuredData\.json$/i.test(e.entryName));
        if (!entry) {
            return { error: "Adobe Extract output did not include structuredData.json." };
        }
        const jsonText = zip.readAsText(entry, "utf-8");
        let data;
        try {
            data = JSON.parse(jsonText);
        }
        catch {
            return { error: "Failed to parse structuredData.json." };
        }
        const text = collectTextFromExtractJson(data);
        if (!text || !text.trim()) {
            return { error: "No text content found in Adobe Extract output." };
        }
        // Optionally extract and persist image renditions
        const images = [];
        if (opts?.includeRenditions && opts?.outputDirAbs && opts?.publicUrlPrefix) {
            try {
                if (!node_fs_1.default.existsSync(opts.outputDirAbs)) {
                    node_fs_1.default.mkdirSync(opts.outputDirAbs, { recursive: true });
                }
                zip.getEntries().forEach((ze) => {
                    const name = ze.entryName || "";
                    // Accept any files under renditions/ with common image extensions (png, jpg, jpeg, webp, svg)
                    if (/^renditions[\\\/].+/i.test(name) && /(\.png|\.jpg|\.jpeg|\.webp|\.svg)$/i.test(name)) {
                        const base = name.replace(/^renditions[\\\/]/i, "");
                        const safeBase = base.replace(/[^a-zA-Z0-9_\-./]/g, "_");
                        const destAbs = node_path_1.default.join(opts.outputDirAbs, safeBase);
                        const destDir = node_path_1.default.dirname(destAbs);
                        if (!node_fs_1.default.existsSync(destDir))
                            node_fs_1.default.mkdirSync(destDir, { recursive: true });
                        const fileBuf = ze.getData();
                        node_fs_1.default.writeFileSync(destAbs, fileBuf);
                        const publicPath = `${opts.publicUrlPrefix}/${safeBase}`.replace(/\\/g, "/");
                        images.push(publicPath);
                    }
                });
            }
            catch (e) {
                // Non-fatal: continue without images
            }
        }
        // Create markdown by appending figures section (non-destructive)
        let markdown = text;
        if (images.length > 0) {
            const lines = [];
            lines.push("\n\n## Figures\n");
            images.forEach((url, idx) => {
                lines.push(`![Figure ${idx + 1}](${url})`);
            });
            markdown = `${text.trim()}\n\n${lines.join("\n")}`;
        }
        return { text, markdown, images };
    }
    catch (err) {
        const known = err instanceof SDKError || err instanceof ServiceUsageError || err instanceof ServiceApiError;
        const msg = err?.message || String(err);
        return { error: `Adobe Extract failed${known ? " (SDK)" : ""}: ${msg}` };
    }
    finally {
        try {
            readStream?.destroy();
        }
        catch { }
    }
}
function collectTextFromExtractJson(root) {
    const lines = [];
    let lastPage = null;
    function visit(node, currentPage) {
        if (!node)
            return;
        if (Array.isArray(node)) {
            for (const n of node)
                visit(n, currentPage);
            return;
        }
        if (typeof node === "object") {
            // Track page number if available on this node
            let page = currentPage;
            if (typeof node.Page === "number")
                page = node.Page;
            else if (typeof node.page === "number")
                page = node.page;
            // Adobe JSON uses capitalized key `Text` for text runs
            if (typeof node.Text === "string" && node.Text.trim()) {
                if (page != null && page !== lastPage) {
                    lines.push(`<!-- PAGEBREAK:${page} -->`);
                    lastPage = page;
                }
                lines.push(node.Text);
            }
            // Some variants may use lowercase 'text'
            if (typeof node.text === "string" && node.text.trim()) {
                if (page != null && page !== lastPage) {
                    lines.push(`<!-- PAGEBREAK:${page} -->`);
                    lastPage = page;
                }
                lines.push(node.text);
            }
            for (const key of Object.keys(node)) {
                const val = node[key];
                if (val && typeof val === "object" && key !== "Bounds" && key !== "BoundingBox") {
                    visit(val, page);
                }
            }
        }
    }
    if (root?.elements)
        visit(root.elements, null);
    else
        visit(root, null);
    // Normalize excessive blank lines
    const joined = lines.join("\n");
    return joined.replace(/\n{3,}/g, "\n\n");
}
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (d) => {
            chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d));
        });
        stream.once("error", reject);
        stream.once("end", () => resolve(Buffer.concat(chunks)));
    });
}
