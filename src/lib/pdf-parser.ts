import type { PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api";

export interface PdfTextLine {
  text: string;
  left?: number;
  redSpans?: Array<{ start: number; end: number }>;
  tableIndex?: { number: number; end: number };
}

export interface PdfExtractionResult {
  text: string;
  lines: PdfTextLine[];
  pageCount: number;
  emptyPages: number;
}

type PdfOperators = typeof import("pdfjs-dist").OPS;
type TextRun = { text: string; red: boolean };
const spaced = /\s/u;
const compact = (text: string) => text.replace(/\s/gu, "").normalize("NFKC");

function redFill(color: unknown): boolean {
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return false;
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  return r >= 135 && r - Math.max(g, b) >= 85;
}

async function redTextItems(page: PDFPageProxy, items: TextItem[], ops: PdfOperators): Promise<Map<TextItem, boolean[]>> {
  const { fnArray, argsArray } = await page.getOperatorList();
  const stack: boolean[] = [];
  const runs: TextRun[] = [];
  let red = false;
  for (let index = 0; index < fnArray.length; index += 1) {
    const op = fnArray[index];
    const args = argsArray[index];
    if (op === ops.save || op === ops.paintFormXObjectBegin) stack.push(red);
    else if (op === ops.restore || op === ops.paintFormXObjectEnd) red = stack.pop() ?? false;
    else if (op === ops.setFillRGBColor) red = redFill(args?.[0]);
    else if (op === ops.setFillColorN || op === ops.setFillTransparent) red = false;
    else if (op === ops.showText) {
      const glyphs = args[0] as Array<number | { unicode?: string } | null>;
      runs.push({ text: glyphs.map((glyph) => typeof glyph === "object" ? glyph?.unicode ?? "" : "").join(""), red });
    }
  }

  const marked = new Map<TextItem, boolean[]>();
  if (!runs.some((run) => run.red)) return marked;

  // Color is only transferred when both PDF.js streams agree in reading order.
  const rendered = runs.map((run) => ({ text: compact(run.text), red: run.red }));
  const extracted = items.map((item) => compact(item.str));
  if (rendered.map((run) => run.text).join("") !== extracted.join("")) return marked;

  const flags = rendered.flatMap(({ text, red }) => Array<boolean>(text.length).fill(red));
  let offset = 0;
  for (const [index, item] of items.entries()) {
    const length = extracted[index].length;
    let cursor = offset;
    const chars = item.str.split("").map((char) => {
      const size = compact(char).length;
      const isRed = size > 0 && flags.slice(cursor, cursor + size).every(Boolean);
      cursor += size;
      return isRed;
    });
    if (cursor === offset + length && chars.some(Boolean)) marked.set(item, chars);
    offset += length;
  }
  return marked;
}

function readLines(items: TextItem[], colors: Map<TextItem, boolean[]>, page: PDFPageProxy): PdfTextLine[] {
  const sorted = items.filter((item) => item.str !== "")
    .sort((a, b) => b.transform[5] - a.transform[5]);
  const rows: Array<{ y: number; items: TextItem[] }> = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const row = rows.at(-1);
    if (row && row.y - y < 2.5) row.items.push(item);
    else rows.push({ y, items: [item] });
  }

  const [left, bottom, right, top] = page.view;
  const center = (left + right) / 2;
  const margin = (top - bottom) * 0.1;
  for (const row of rows) row.items.sort((a, b) => a.transform[4] - b.transform[4]);
  return rows.flatMap((row, rowIndex) => {
    const lineItems = row.items.filter((item) => item.str.trim());
    const first = lineItems.find((item) => item.str.trim());
    if (!first) return [];

    let text = "";
    const redSpans: NonNullable<PdfTextLine["redSpans"]> = [];
    let previous: TextItem | undefined;
    for (const item of row.items) {
      const x = item.transform[4];
      if (previous && !spaced.test(text.slice(-1)) && !spaced.test(item.str[0])) {
        const gap = x - previous.transform[4] - previous.width;
        if (gap > Math.max(1, item.height * 0.17)) text += " ";
      }
      const flags = colors.get(item);
      for (let index = 0; index < item.str.length; index += 1) {
        if (flags?.[index]) {
          const span = redSpans.at(-1);
          if (span?.end === text.length) span.end += 1;
          else redSpans.push({ start: text.length, end: text.length + 1 });
        }
        text += item.str[index];
      }
      previous = item;
    }

    const atMargin = row.y < bottom + margin || row.y > top - margin;
    const centered = Math.abs(first.transform[4] + first.width / 2 - center) < (right - left) * 0.1;
    if (atMargin && centered && text.trim() === String(page.pageNumber)) return [];

    const index = text.match(/^\s*(\d{1,4})(?!\d)(?:[ \t]*\*+)?/u);
    let tableIndex: PdfTextLine["tableIndex"];
    if (index && /^\s*\d/u.test(first.str)) {
      // Index and question cells can have different vertical padding.
      const below = rows[rowIndex + 1];
      const following = lineItems[1] ?? (
        below && row.y - below.y <= Math.max(7, first.height * 0.8)
          ? below.items.find((item) => item.str.trim())
          : undefined
      );
      const gap = following ? following.transform[4] - first.transform[4] - first.width : 0;
      if (gap >= Math.max(8, first.height * 0.8)) {
        tableIndex = { number: Number(index[1]), end: index[0].length };
      }
    }
    const textLeft = tableIndex && lineItems[1] ? lineItems[1].transform[4] : first.transform[4];
    return [{ text, left: textLeft, redSpans: redSpans.length ? redSpans : undefined, tableIndex }];
  });
}

export async function extractPdfText(file: File, onProgress?: (progress: number) => void): Promise<PdfExtractionResult> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Vui lòng chọn đúng file PDF.");
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  try {
    const document = await task.promise;
    const lines: PdfTextLine[] = [];
    let emptyPages = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is TextItem => "str" in item);
      const colors = items.length
        ? await redTextItems(page, items, pdfjs.OPS).catch(() => new Map<TextItem, boolean[]>())
        : new Map<TextItem, boolean[]>();
      const pageLines = readLines(items, colors, page);
      if (pageLines.length === 0) emptyPages += 1;
      lines.push(...pageLines);
      page.cleanup();
      onProgress?.(Math.round((pageNumber / document.numPages) * 100));
    }
    return { lines, text: lines.map((line) => line.text).join("\n"), pageCount: document.numPages, emptyPages };
  } finally {
    await task.destroy();
  }
}
