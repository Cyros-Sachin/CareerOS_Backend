import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pathToFileURL } from "url";

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
).href;

export interface ExtractionResult {
  text: string;
  pageCount: number;
}

export async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    disableFontFace: true,
  }).promise;

  const pageCount = doc.numPages;

  const pages: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(" ");
    pages.push(text);
  }

  return {
    text: pages.join("\n\n"),
    pageCount,
  };
}