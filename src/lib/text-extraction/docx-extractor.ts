import mammoth from "mammoth";

export interface ExtractionResult {
  text: string;
  pageCount: number;
}

export async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });

  const text = result.value || "";
  const messages = result.messages;

  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (msg.type === "warning") {
        console.warn("Mammoth warning:", msg.message);
      }
    }
  }

  const pageCount = estimatePageCount(text);

  return { text, pageCount };
}

function estimatePageCount(text: string): number {
  if (!text) return 0;
  const charsPerPage = 3000;
  const lines = text.split("\n").length;
  const charCount = text.length;
  const fromChars = Math.ceil(charCount / charsPerPage);
  const fromLines = Math.ceil(lines / 50);
  return Math.max(1, Math.min(Math.max(fromChars, fromLines), 10));
}
