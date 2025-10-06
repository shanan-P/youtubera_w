declare module '~/services/pdf.server' {
  export function createPdfFromHtml(
    htmlContent: string, 
    outputPath: string, 
    theme: string
  ): Promise<void>;
}
