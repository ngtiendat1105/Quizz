export interface PdfExtractionResult { text: string; pageCount: number; emptyPages: number; }

export async function extractPdfText(file: File, onProgress?: (progress: number) => void): Promise<PdfExtractionResult> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Vui lòng chọn đúng file PDF.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  let emptyPages = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
    if (!text) emptyPages += 1;
    pages.push(text);
    onProgress?.(Math.round((pageNumber / document.numPages) * 100));
  }
  return { text: pages.join("\n"), pageCount: document.numPages, emptyPages };
}
