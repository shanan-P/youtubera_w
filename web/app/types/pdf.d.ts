declare module '~/services/pdf.server' {
  export interface ExtractTextResult {
    text: string;
    markdown?: string;
    error?: string;
  }
  
  export function extractTextFromPdfWithAdobe(pdfPath: string): Promise<ExtractTextResult>;
}

declare module '~/services/video.server' {
  export interface GenerateShortsResult {
    success: boolean;
    error?: string;
  }
  
  export function generateShortsForCourse(entryId: string): Promise<GenerateShortsResult>;
}

declare module '~/services/markdown.server' {
  export interface FormatOptions {
    styleSampleText?: string;
  }
  
  export function formatTextToMarkdown(
    text: string, 
    title: string, 
    options?: FormatOptions
  ): Promise<{ markdown: string; warning?: string }>;
}
