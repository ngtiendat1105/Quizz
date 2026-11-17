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
    const positioned = content.items
      .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && "transform" in item)
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
      .filter((item) => item.text.trim());
    const lines: Array<{ y: number; items: Array<{ text: string; x: number }> }> = [];
    positioned.forEach((item) => {
      const line = lines.find((candidate) => Math.abs(candidate.y - item.y) < 3);
      if (line) line.items.push({ text: item.text, x: item.x });
      else lines.push({ y: item.y, items: [{ text: item.text, x: item.x }] });
    });
    const text = lines
      .sort((a, b) => b.y - a.y)
      .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
      .join("\n");
    if (!text) emptyPages += 1;
    pages.push(text);
    onProgress?.(Math.round((pageNumber / document.numPages) * 100));
  }
  return { text: pages.join("\n"), pageCount: document.numPages, emptyPages };
}
