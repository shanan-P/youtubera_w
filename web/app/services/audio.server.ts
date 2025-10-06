import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from 'crypto';
import { join, resolve as resolvePath } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { getTopicsFromAudio } from "./gemini.server";

function ensureDir(dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export interface AudioProcessingResult {
    results?: string;
    error?: string;
}

export interface SaveUploadedAudioResult {
    absPath: string;
    relPath: string;
    fileName: string;
}

export async function saveUploadedAudio(file: File, courseId: string): Promise<SaveUploadedAudioResult> {
    const uploadsDir = resolvePath("public", "uploads", "audio", courseId);
    await mkdir(uploadsDir, { recursive: true });
    
    const fileExt = file.name.split('.').pop() || 'mp3';
    const fileName = `${randomUUID()}.${fileExt}`;
    const filePath = join(uploadsDir, fileName);
    
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);
    
    return {
      absPath: filePath,
      relPath: `/uploads/audio/${courseId}/${fileName}`,
      fileName
    };
}

export async function processAudio(
    audioSource: File,
    mode: 'segmentation' | 'transcription',
    customQuery?: string
  ): Promise<{ results?: string; error?: string }> {
    console.log("--- Entering processAudio function ---");
  
    // For File objects, we need to save them to a temporary path
    const tempDir = resolvePath("public", "downloads", "temp");
    ensureDir(tempDir);
    const audioPath = join(tempDir, audioSource.name);
    console.log("[processAudio] Attempting to save uploaded file to:", audioPath);
    try {
      const buffer = Buffer.from(await (audioSource as File).arrayBuffer());
      await writeFile(audioPath, buffer);
      console.log("[processAudio] Successfully saved uploaded file.");
    } catch (error) {
      console.error("[processAudio] Failed to write uploaded file:", error);
      return { error: "Failed to save uploaded file" };
    }
  
    if (mode === "segmentation" || mode === "transcription") {
      console.log("[processAudio] Calling getTopicsFromAudio with audioPath:", audioPath);
      const topicsResult = await getTopicsFromAudio(audioPath, mode, customQuery);
      console.log("[processAudio] getTopicsFromAudio returned:", topicsResult);
      if (topicsResult.error) {
        console.error("[processAudio] Gemini processing failed:", topicsResult.error);
        return { error: `Gemini processing failed: ${topicsResult.error}` };
      }
      console.log("[processAudio] Gemini processing successful:", topicsResult.text);
      return { results: topicsResult.text };
    }
  
    return { results: "" };
  }
  