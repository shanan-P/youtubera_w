// Gemini PDF text extraction service
import * as fs from 'fs/promises';
import { parseFile } from 'music-metadata';

// Custom logging array
const logMessages: string[] = [];

function customLog(...args: any[]) {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logMessages.push(message);
  console.log(...args); // Still log to console for local debugging if visible
}

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash-latest";

if (!GEMINI_API_KEY) {
  customLog("GEMINI_API_KEY is not set. Add it to .env to use Gemini features.");
}

/**
 * Paginates a markdown string by a given character size, inserting page break markers
 * for consumption by the NotebookViewer component. It tries to break content at logical
 * points like paragraph breaks.
 */
function paginateMarkdown(text: string, size: number = 4000): string {
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
  mode: 'brief' | 'detail' | 'original',
  options: { maxRetries?: number; initialDelay?: number } = {}
): Promise<{ text?: string; error?: string }> {
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

  const formattedPages: string[] = [];
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
      } else {
        formattedPages.push(`--- Pages ${startPage}-${endPage} Formatting Returned No Content ---`);
      }

    } catch (error) {
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


export async function getTopicsFromAudio(
  audioPath: string,
  mode: 'segmentation' | 'transcription',
  customQuery?: string
): Promise<{ text?: string; error?: string }> {
  console.log("Entering getTopicsFromAudio with audioPath:", audioPath, "and mode:", mode, "and customQuery:", customQuery);

  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not configured");
    return { error: "GEMINI_API_KEY is not configured" };
  }

  try {
    const { format } = await parseFile(audioPath);
    const duration = format.duration ? Math.round(format.duration) : 0;

    const audioBuffer = await fs.readFile(audioPath);
    const fileName = audioPath.split('/').pop() || 'audio.flac';
    
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}&uploadType=media`;
    
    console.log("Initiating Gemini file upload to:", uploadUrl);
    
    const audioBlob = new Blob([Uint8Array.from(audioBuffer).buffer], { type: 'audio/flac' });

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/flac', // Set the correct MIME type
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
        ? 'Transcribe the following audio. If the audio is not in English, please transcribe it and then translate the transcription to English.'
        : customQuery
        ? `Transcribe the following audio and answer the question: ${customQuery}`
        : `You are an expert in analyzing audio content. Your task is to process the given audio file and generate a structured summary of its key topics. The total duration of the audio file is ${duration} seconds. Please ensure that all timestamps in your response are within this duration.`;

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
        maxOutputTokens: 8192,
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