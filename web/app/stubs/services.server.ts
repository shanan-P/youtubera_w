// Stub implementations for services that are not yet implemented

export interface ExtractTextResult {
  text: string;
  markdown?: string;
  error?: string;
}

export const extractTextFromPdfWithAdobe = async (pdfPath: string): Promise<ExtractTextResult> => {
  console.log(`[STUB] extractTextFromPdfWithAdobe called with path: ${pdfPath}`);
  if (!pdfPath) {
    return { error: 'No PDF path provided', text: '' };
  }
  return {
    text: 'Sample extracted text from PDF. This is a stub implementation.',
    markdown: '# Sample Extracted Text\n\nThis is a stub implementation of the Adobe PDF text extraction.'
  };
};

export const generateShortsForCourse = async (entryId: string) => {
  console.log(`[STUB] generateShortsForCourse called with entryId: ${entryId}`);
  return { success: true };
};

export const formatTextToMarkdown = async (
  text: string, 
  title: string,
  options?: { styleSampleText?: string }
) => {
  console.log(`[STUB] formatTextToMarkdown called with title: ${title}`);
  return { 
    markdown: `# ${title}\n\n${text}`, 
    error: undefined 
  };
};