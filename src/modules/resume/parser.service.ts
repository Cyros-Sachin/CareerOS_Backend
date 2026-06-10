import fs from "fs";
import mammoth from "mammoth";

export async function parseResume(
  filePath: string
): Promise<string> {
  const extension =
    filePath.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return parsePdf(filePath);
  }

  if (extension === "docx") {
    const result =
      await mammoth.extractRawText({
        path: filePath,
      });

    return result.value;
  }

  throw new Error(
    "Unsupported file type"
  );
}

async function parsePdf(
  filePath: string
): Promise<string> {
  const pdfjsLib = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );

  const buffer =
    fs.readFileSync(filePath);

  const uint8Array =
    new Uint8Array(buffer);

  const pdf =
    await pdfjsLib.getDocument({
      data: uint8Array,
    }).promise;

  let text = "";

  for (
    let pageNum = 1;
    pageNum <= pdf.numPages;
    pageNum++
  ) {
    const page =
      await pdf.getPage(pageNum);

    const content =
      await page.getTextContent();

    const pageText =
      content.items
        .map((item: any) =>
          item.str ?? ""
        )
        .join(" ");

    text += pageText + "\n";
  }

  return text;
}