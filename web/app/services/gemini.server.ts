// Gemini PDF text extraction service
import * as fs from 'fs/promises';
import { env } from 'node:process';
import { parseFile } from 'music-metadata';
import { suggestSegmentsFromTranscript } from './ai.server';
import { getYouTubeTranscriptVtt, vttToPlainTextWithTimestamps } from './video.server';


// Custom logging array
const logMessages: string[] = [];

function customLog(...args: any[]) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logMessages.push(message);
  console.log(...args); // Still log to console for local debugging if visible
}

// Configuration
const GEMINI_API_KEY = env.GEMINI_API_KEY || "";
const GEMINI_MODEL = env.GEMINI_MODEL || "gemini-1.5-flash-latest";

if (!GEMINI_API_KEY) {
  customLog("GEMINI_API_KEY is not set. Add it to .env to use Gemini features.");
}

/**
 * Splits text into chunks based on character limit while preserving word boundaries
 */
function splitTextIntoChunks(text: string, characterLimit: number): string[] {
  if (!text || text.length <= characterLimit) {
    return [text];
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + characterLimit;

    // If we're not at the end of the text, find the last complete word boundary
    if (endIndex < text.length) {
      // Look for the last space, newline, or sentence end within the limit
      let lastBoundary = endIndex;

      // Search backwards for word boundaries
      for (let i = endIndex; i > startIndex && i > startIndex + characterLimit * 0.8; i--) {
        if (text[i] === '\n' || text[i] === ' ' || text[i] === '.' || text[i] === '!' || text[i] === '?') {
          lastBoundary = i + 1; // Include the boundary character
          break;
        }
      }

      endIndex = Math.min(lastBoundary, text.length);
    } else {
      endIndex = text.length;
    }

    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    startIndex = endIndex;
  }

  return chunks;
}

/**
 * Builds the Gemini prompt for a specific chunk
 */
function buildGeminiPrompt(chunk: string, mode: string, chunkNumber: number, totalChunks: number): string {
  let promptAction;
  switch (mode) {
    case 'brief':
      promptAction = 'Please format and **briefly summarize** the following text';
      break;
    case 'detail':
      promptAction = 'Please format and **add detail to** the following text';
      break;
    case 'hinglish':
      promptAction = 'Please format the following text and **convert it to Hinglish** (Hindi-English mix) for better understanding. Use Hindi words where appropriate while keeping technical terms in English. **DO NOT convert code blocks, function definitions, or programming syntax** - keep them exactly as they are in English. Only convert explanatory text, descriptions, and comments to Hinglish';
      break;
    case 'original':
    default:
      promptAction = 'Please format the following text';
      break;
  }

  return [
    `${promptAction} (chunk ${chunkNumber} of ${totalChunks}) into clean, well-structured markdown. Follow these instructions carefully:`,
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
    ...(mode === 'hinglish' ? [
      '- **Hinglish Conversion:**',
      '  - If asked to **convert to Hinglish**, translate the entire content to Hindi-English mix while preserving all technical terms in English.',
      '  - **DO NOT convert code blocks, function definitions, class definitions, or any programming syntax** - keep them exactly as they are in English.',
      '  - Keep all code examples, algorithms, and technical content in their original form.',
      '  - Maintain all section headings, bullet points, and formatting structure.',
      '  - Use Hindi words for descriptive text, explanations, and conclusions while keeping programming terms in English.',
      '  - Do not summarize or omit any content - convert everything to Hinglish while preserving completeness.',
      '  - Code blocks (marked with ```) should remain completely unchanged in English.',
      '',
    ] : mode === 'brief' ? [
      '- **Brief Mode:**',
      '  - Provide a concise summary of the content, keeping the essence and key points.',
      '  - Remove unnecessary details while preserving core concepts.',
      '',
    ] : mode === 'detail' ? [
      '- **Detail Mode:**',
      '  - Expand on the content with additional context and explanations.',
      '  - For questions, provide comprehensive answers.',
      '  - For stories and examples, add appropriate depth and background.',
      '',
    ] : []),
    '- **Special Characters & Encoding:**',
    '  - Preserve all original special characters, symbols (e.g., 🚀, 💡, 📢), and unicode characters. Ensure they are rendered correctly in markdown.',
    '  - Some characters like  might be rendering artifacts. If a character seems out of place, try to interpret its meaning or remove it if it adds no value.',
    '  - Do not include page numbers in the output.',
    '',
    '- **Output:**',
    '  - Ensure the output is only valid markdown.',
    '  - This is chunk ' + chunkNumber + ' of ' + totalChunks + '. Process only this portion.',
    '',
    'Here is the text chunk:',
    '---',
    chunk
  ].join('\n');
}





/**
 * Paginates a markdown string by a given character size, inserting page break markers
 * for consumption by the NotebookViewer component. It tries to break content at logical
 * points like paragraph breaks.
 */
function paginateMarkdown(text: string, size: number = 2500): string {
  if (!text || text.length <= size) {
    return `<!-- PAGEBREAK:1 -->\n\n${text}`;
  }

  const resultChunks: string[] = [];
  let pageCounter = 1;
  let remainingText = text;

  while (remainingText.length > 0) {
    resultChunks.push(`<!-- PAGEBREAK:${pageCounter} -->`);

    let splitPos = Math.min(remainingText.length, size);

    if (remainingText.length > size) {
      let tempSplitPos = remainingText.lastIndexOf('\n\n', size);
      if (tempSplitPos > size / 2) {
        splitPos = tempSplitPos;
      } else {
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




export async function formatWithGemini(
  text: string,
  mode: 'brief' | 'detail' | 'original' | 'hinglish',
  options: { maxRetries?: number; initialDelay?: number } = {}
): Promise<{ text?: string; error?: string }> {
  if (!text) {
    return { error: "No text provided to format." };
  }

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not configured');
    return { error: 'GEMINI_API_KEY is not configured' };
  }

  // First, paginate the content to preserve page structure
  const paginatedContent = paginateMarkdown(text, 2500);

  // Split the paginated content back into individual pages for formatting
  const pageChunks = paginatedContent.split(/<!--\s*PAGEBREAK:\s*\d+\s*-->/gi).filter(chunk => chunk.trim());

  if (pageChunks.length === 0) {
    return { error: "No content to format after pagination." };
  }

  const formattedPages: string[] = [];

  for (let i = 0; i < pageChunks.length; i++) {
    const chunk = pageChunks[i];
    const chunkNumber = i + 1;

    // Add a 2-second delay between chunks to stay within rate limits
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const prompt = buildGeminiPrompt(chunk, mode, chunkNumber, pageChunks.length);

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
        console.error(`Gemini API error for page ${chunkNumber}:`, response.status, errorText);

        // Implement retry logic with backoff for 429 errors
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000; // Default to 30s
          console.log(`Rate limited. Retrying page ${chunkNumber} in ${retryDelay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          // Decrement i to retry the same page
          i--;
          continue;
        }

        // Continue to next page even if one fails
        formattedPages.push(`--- Page ${chunkNumber} Formatting Failed ---`);
        continue;
      }

      const data = await response.json();
      const formattedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (formattedText) {
        formattedPages.push(formattedText);
      } else {
        formattedPages.push(`--- Page ${chunkNumber} Formatting Returned No Content ---`);
      }

    } catch (error) {
      console.error(`Error formatting page ${chunkNumber}:`, error);
      formattedPages.push(`--- Page ${chunkNumber} Formatting Failed with exception ---`);
    }
  }

  // Join the formatted pages back with PAGEBREAK markers
  const fullMarkdown = formattedPages.map((page, idx) => `<!-- PAGEBREAK:${idx + 1} -->\n\n${page}`).join('\n\n');

  return { text: fullMarkdown };
}


export async function getTopicsFromAudio(
  audioPath: string,
  mode: 'segmentation' | 'transcription',
  customQuery?: string,
  url?: string
): Promise<{ text?: string; error?: string }> {
  console.log("Entering getTopicsFromAudio with audioPath:", audioPath, "and mode:", mode, "and customQuery:", customQuery, "and url:", url);

  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not configured");
    return { error: "GEMINI_API_KEY is not configured" };
  }

  if (mode === 'segmentation') {
    let transcript = null;
    if (url) {
      console.log("Segmentation mode with URL, attempting transcript-based segmentation.");
      const vtt = await getYouTubeTranscriptVtt(url);
      if (vtt) {
        console.log("Successfully fetched VTT transcript.");
        transcript = vttToPlainTextWithTimestamps(vtt);
      }
    } else {
      console.log("Segmentation mode without URL, attempting to generate transcript from audio.");
      const transcriptResult = await getTopicsFromAudio(audioPath, 'transcription', customQuery);
      if (transcriptResult.text) {
        transcript = transcriptResult.text;
      }
    }

    if (transcript) {
      const segments = await suggestSegmentsFromTranscript(url || '', transcript, customQuery);
      return { text: JSON.stringify(segments) };
    } else {
      console.log("No transcript found, falling back to audio-based segmentation.");
    }
  }

  try {
    const { format } = await parseFile(audioPath);
    const duration = format.duration ? Math.round(format.duration) : 0;

    const fileExt = audioPath.split('.').pop()?.toLowerCase() || 'flac';
    const mimeType = `audio/${fileExt}`;

    const audioBuffer = await fs.readFile(audioPath);
    const fileName = audioPath.split(/[\\/]/).pop() || `audio.${fileExt}`;
    
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}&uploadType=media`;
    
    console.log("Initiating Gemini file upload to:", uploadUrl);
    
    const audioBlob = new Blob([Uint8Array.from(audioBuffer).buffer], { type: mimeType });

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType, // Set the correct MIME type
        'X-Goog-Upload-Protocol': 'raw', // Indicate raw upload
        'X-Goog-Upload-File-Name': fileName, // Provide file name
      },
      body: audioBlob, // Directly send the blob
    });
    
    console.log("Gemini file upload response status:", uploadResponse.status, uploadResponse.statusText);
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Gemini file upload failed:", uploadResponse.status, errorText);
      return { error: `Gemini file upload failed: ${uploadResponse.status} - ${errorText}` };
    }
    
    const uploadResult = await uploadResponse.json();
    console.log("Gemini file upload result:", uploadResult);
    
    if (!uploadResult?.file?.uri) {
      console.error("Invalid Gemini file upload response or missing file URI:", uploadResult);
      return { error: "Gemini file upload response missing file URI or invalid format." };
    }
    
    const fileUri = uploadResult.file.uri;

    const prompt =
      mode === 'transcription'
        ? 'Transcribe the following audio. If the audio is not in English, please transcribe it and then translate the transcription to English. The output MUST be in plain text with timestamps for each transcribed segment. For example: [00:00:01.000-00:00:04.000] Hello world. Do not include any other text, titles, or translations in the output.'
        : customQuery
        ? `Transcribe the following audio and answer the question: ${customQuery}`
        : `You are an expert in analyzing audio content. Your task is to process the entire audio file and generate a structured summary of its key topics. The total duration of the audio file is ${duration} seconds. Please ensure that all timestamps in your response are within this duration. Return strictly valid JSON with the following shape:
{
  "segments": [
    { "title": string, "startSeconds": number, "endSeconds": number, "summary": string }
  ]
}
Rules:
- Process the entire audio file.
- startSeconds < endSeconds
- Prefer 3 to 12 segments depending on content length
- Titles should be short nouns or phrases
- summary is 1-2 sentences, helpful and specific
- Output ONLY the JSON, no markdown, no commentary.`;

    console.log("Using prompt for Gemini:", prompt);

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const generateRequest = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: "audio/flac",
                fileUri: fileUri
              }
            },
          ],
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 16384,
      },
    };

    console.log("Sending generation request to Gemini...");
    const generateResponse = await fetch(generateUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json" 
      },
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
  } catch (error) {
    console.error("Error processing audio with Gemini:", String(error));
    return { error: `An unexpected error occurred during Gemini audio processing: ${String(error)}` };
  }
}
