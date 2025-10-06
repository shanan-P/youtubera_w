import fs from "fs/promises";

export async function extractTextFromPdfLocal(pdfPath: string): Promise<{ text?: string; error?: string }> {
  try {
    // Dynamic import to avoid ESM/CJS interop issues
    const mod: any = await import("pdf-parse");
    const pdfParse = mod?.default ?? mod;
    const buffer = await fs.readFile(pdfPath);
    const result = await pdfParse(buffer);
    const text = String(result?.text || "").trim();
    if (!text) return { error: "No text extracted from PDF (local parser)." };
    return { text };
  } catch (e: any) {
    return { error: `Local PDF parse failed: ${e?.message || e}` };
  }
}
