declare module "pdf-parse" {
  export interface PDFInfo {
    Title?: string;
    [key: string]: any;
  }
  export interface PDFData {
    numpages?: number;
    numrender?: number;
    info?: PDFInfo;
    metadata?: any;
    text?: string;
    version?: string;
  }
  function pdfParse(dataBuffer: Buffer | Uint8Array, options?: any): Promise<PDFData>;
  export default pdfParse;
}
