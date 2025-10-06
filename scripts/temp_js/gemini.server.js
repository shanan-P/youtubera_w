"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatWithGemini = formatWithGemini;
exports.getTopicsFromAudio = getTopicsFromAudio;
// Gemini PDF text extraction service
const fs = __importStar(require("fs/promises"));
// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash-latest";
if (!GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set. Add it to .env to use Gemini features.");
}
/**
 * Paginates a markdown string by a given character size, inserting page break markers
 * for consumption by the NotebookViewer component. It tries to break content at logical
 * points like paragraph breaks.
 */
function paginateMarkdown(text, size = 4000) {
    if (!text || text.length <= size) {
        return `<!-- PAGEBREAK:1 -->\n\n${text}`;
    }
    const resultChunks = [];
    let pageCounter = 1;
    let remainingText = text;
    while (remainingText.length > 0) {
        resultChunks.push(`<!-- PAGEBREAK:${pageCounter} -->`);
        let splitPos = Math.min(remainingText.length, size);
        if (remainingText.length > size) {
            let tempSplitPos = remainingText.lastIndexOf('\n\n', size);
            if (tempSplitPos > size / 2) {
                splitPos = tempSplitPos;
            }
            else {
                tempSplitPos = remainingText.lastIndexOf('\n', size);
                if (tempSplitPos > size / 2) {
                    splitPos = tempSplitPos;
                }
            }
        }
        const chunk = remainingText.substring(0, splitPos);
        resultChunks.push(chunk);
        remainingText = remainingText.substring(splitPos).trim();
        pageCounter++;
    }
    return resultChunks.join('\n\n');
}
/**
 * Formats text using the Gemini API with retry logic and proper error handling.
 * This function now chunks the text by page breaks and sends each page to Gemini.
 */
async function formatWithGemini(text, mode, options = {}) {
    if (!text) {
        return { error: "No text provided to format." };
    }
    if (!GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is not configured');
        return { error: 'GEMINI_API_KEY is not configured' };
    }
    // Split the text by page breaks
    const pageChunks = text.split(/<!-- PAGEBREAK:\d+ -->/g).map(s => s.trim()).filter(Boolean);
    if (pageChunks.length === 0) {
        return { error: "No content to format after splitting by page breaks." };
    }
    const formattedPages = [];
    let pageCounter = 1;
    const chunkSize = 5; // Process 5 pages at a time
    for (let i = 0; i < pageChunks.length; i += chunkSize) {
        const chunkGroup = pageChunks.slice(i, i + chunkSize);
        const startPage = pageCounter;
        const endPage = pageCounter + chunkGroup.length - 1;
        // Add a 4-second delay to stay within the 15 requests/minute limit for the free tier
        await new Promise(resolve => setTimeout(resolve, 4000));
        const combinedChunk = chunkGroup.join('\n\n');
        let promptAction;
        switch (mode) {
            case 'brief':
                promptAction = 'Please format and **briefly summarize** the following text';
                break;
            case 'detail':
                promptAction = 'Please format and **add detail to** the following text';
                break;
            case 'original':
            default:
                promptAction = 'Please format the following text';
                break;
        }
        const prompt = [
            `${promptAction} from pages`,
            `${startPage}-${endPage}`,
            'of a document into clean, well-structured markdown. Follow these instructions carefully:',
            '',
            '- **Content & Structure:**',
            '  - The text may contain repeating headers and footers on each page (e.g., \'Laying the Foundation! (Namaste-React) 1\'). Remove these.',
            '  - Preserve the original sequence of paragraphs and content.',
            '  - Correct any spelling mistakes.',
            '  - Split PascalCase words into separate words (e.g., "PascalCase" becomes "Pascal Case").',
            '  - Do not add any introductory or concluding text that is not part of the original content.',
            '',
            '- **Styling & Formatting:**',
            '  - Use markdown headings (#, ##, ###) for titles and subtitles.',
            '  - Use bold (**text**) for emphasis on key terms and file names.',
            '  - Use inline code formatting (`code`) for variable names and short code snippets.',
            '  - Format multi-line code blocks with appropriate language identifiers (e.g., ```javascript ... ```).',
            '  - Preserve lists and format them correctly as bulleted or numbered lists.',
            '  - Format questions (often starting with \'Q )\') as a bolded heading, with the answer on a new line.',
            '  - Format notes (often starting with 💡 or 📢 NOTE:) as markdown blockquotes (>).',
            '',
            '- **Brief vs. Detail:**',
            '  - If asked to **brief**, provide a concise summary of the content, keeping the essence and key points.',
            '  - If asked to **add detail**, expand on the content. For questions, add answers. For stories, add appropriate context and length.',
            '  - If just asked to **format**, keep the original content length and meaning.',
            '',
            '- **Special Characters & Encoding:**',
            '  - Preserve all original special characters, symbols (e.g., 🚀, 💡, 📢), and unicode characters. Ensure they are rendered correctly in markdown.',
            '  - Some characters like  might be rendering artifacts. If a character seems out of place, try to interpret its meaning or remove it if it adds no value.',
            '  - Do not include page numbers in the output.',
            '',
            '- **Output:**',
            '  - Ensure the output is only valid markdown.',
            '',
            `Here is the text from pages ${startPage}-${endPage}:`,
            '---',
            combinedChunk
        ].join('\n');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const requestBody = {
            contents: [{
                    parts: [{ text: prompt }]
                }],
            generationConfig: {
                temperature: 0.2,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ]
        };
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Gemini API error for pages ${startPage}-${endPage}:`, response.status, errorText);
                // Implement retry logic with backoff for 429 errors
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const retryDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000; // Default to 60s
                    console.log(`Rate limited. Retrying pages ${startPage}-${endPage} in ${retryDelay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    // Decrement i to retry the same chunk
                    i -= chunkSize;
                    pageCounter -= chunkGroup.length; // also decrement pageCounter
                    continue;
                }
                // Continue to next chunk even if one fails
                formattedPages.push(`--- Pages ${startPage}-${endPage} Formatting Failed ---`);
                continue;
            }
            const data = await response.json();
            const formattedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (formattedText) {
                formattedPages.push(formattedText);
            }
            else {
                formattedPages.push(`--- Pages ${startPage}-${endPage} Formatting Returned No Content ---`);
            }
        }
        catch (error) {
            console.error(`Error formatting pages ${startPage}-${endPage}:`, error);
            formattedPages.push(`--- Pages ${startPage}-${endPage} Formatting Failed with exception ---`);
        }
        pageCounter += chunkGroup.length;
    }
    // Join the formatted pages into a single markdown string
    const fullMarkdown = formattedPages.join('\n\n');
    // Paginate the final content based on character count for the viewer
    const paginatedContent = paginateMarkdown(fullMarkdown);
    return { text: paginatedContent };
}
async function getTopicsFromAudio(audioPath, customQuery) {
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not configured");
        return { error: "GEMINI_API_KEY is not configured" };
    }
    try {
        const audioBuffer = await fs.readFile(audioPath);
        // 1. Upload the file to the Gemini API
        const uploadUrl = `https://generativelanguage.googleapis.com/v1beta/files?key=${GEMINI_API_KEY}`;
        const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Upload-Protocol": "resumable",
            },
            body: JSON.stringify({ file: { displayName: audioPath } }),
        });
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error("Gemini file upload failed:", uploadResponse.status, errorText);
            return { error: "Gemini file upload failed" };
        }
        const uploadResult = await uploadResponse.json();
        const fileUri = uploadResult.file.uri;
        const gcsUploadUrl = uploadResponse.headers.get("X-Goog-Upload-URL");
        if (!gcsUploadUrl) {
            return { error: "Could not get GCS upload URL" };
        }
        await fetch(gcsUploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "audio/flac" },
            body: audioBuffer,
        });
        // 2. Generate content using the uploaded file
        const prompt = customQuery
            ? `Analyze the following audio and answer the question: ${customQuery}`
            : "Analyze the following audio and provide a detailed list of subtopics with timestamps. Format the output as a markdown list.";
        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const generateRequest = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        { fileData: { mimeType: "audio/flac", fileUri } },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.2,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192,
            },
        };
        const generateResponse = await fetch(generateUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(generateRequest),
        });
        if (!generateResponse.ok) {
            const errorText = await generateResponse.text();
            console.error("Gemini content generation failed:", generateResponse.status, errorText);
            return { error: "Gemini content generation failed" };
        }
        const generateResult = await generateResponse.json();
        const text = generateResult.candidates?.[0]?.content?.parts?.[0]?.text;
        return { text };
    }
    catch (error) {
        console.error("Error processing audio with Gemini:", error);
        return { error: "An unexpected error occurred during Gemini audio processing." };
    }
}
