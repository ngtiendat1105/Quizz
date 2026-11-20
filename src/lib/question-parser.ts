import type { Question, QuestionOption } from "@/types";
import type { PdfTextLine } from "./pdf-parser";

export interface ParsedQuestion extends Question {
  needsReview: boolean;
  reviewReason?: string;
  sourceNumber?: number;
}

const explicitNumber = /^(?:câu|question)\s*(\d{1,4})(?:\s*[.):\-–]\s*|\s+|$)/iu;
const punctuatedNumber = /^(\d{1,4})(?:\s*[.):\-–](?=\s|[^\d]|$))\s*/u;
const bareNumber = /^(\d{1,4})(?:\s+(?=\p{Lu})|$)/u;
const answer = /^(?:đáp\s*án(?:\s*đúng)?|(?:correct\s+)?answer)\s*(?:[:\-–]\s*|\s+)([A-D](?:\s*(?:[,;/+&]|và|and)\s*[A-D])*)[.\s]*$/iu;
const explanationPrefix = /^(?:giải thích|explanation)\s*[:\-–]\s*/iu;

function normalizeText(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function sliceLine(line: PdfTextLine, start: number, end = line.text.length): PdfTextLine {
  return {
    text: line.text.slice(start, end),
    left: line.left,
    tableIndex: line.tableIndex && start < line.tableIndex.end && end >= line.tableIndex.end
      ? { number: line.tableIndex.number, end: line.tableIndex.end - start }
      : undefined,
    redSpans: line.redSpans?.flatMap((span) => {
      const from = Math.max(span.start, start);
      const to = Math.min(span.end, end);
      return from < to ? [{ start: from - start, end: to - start }] : [];
    }),
  };
}

function trimLine(line: PdfTextLine): PdfTextLine {
  return sliceLine(line, line.text.length - line.text.trimStart().length, line.text.trimEnd().length);
}

function isRed(line: PdfTextLine, start = 0, end = line.text.length): boolean {
  const weight = (s: string) => s.replace(/\s/gu, "").length;
  const length = weight(line.text.slice(start, end));
  if (!length || !line.redSpans?.length) return false;
  const colored = line.redSpans.reduce((total, span) => {
    const from = Math.max(span.start, start);
    const to = Math.min(span.end, end);
    return from < to ? total + weight(line.text.slice(from, to)) : total;
  }, 0);
  return colored >= length * 0.8;
}

function logicalLines(lines: readonly PdfTextLine[]): PdfTextLine[] {
  return lines.flatMap((line) => {
    // Bare numbers are considered only at physical line starts, so “B. 5 năm”
    // and quantities in prose cannot become new questions.
    const boundaries = [...line.text.matchAll(/\s+(?=(?:câu|question)\s*\d{1,4}(?:\s*[.):\-–](?!\d)|\s+\p{L})|(?:đáp\s*án(?:\s*đúng)?|(?:correct\s+)?answer|giải thích|explanation)\s*[:\-–])/giu)];
    const starts = [0, ...boundaries.map((match) => match.index + match[0].length)];
    return starts.map((start, index) => trimLine(sliceLine(line, start, starts[index + 1])))
      .filter(({ text }) => text && !/^STT(?:\s|$)/i.test(text) && !/^Nội dung câu hỏi,\s*đáp án$/iu.test(text));
  });
}

type OptionMarker = { id: string; row: number; start: number; end: number };

function optionSequence(lines: PdfTextLine[]): OptionMarker[] {
  const markers = lines.flatMap(({ text }, row) =>
    [...text.matchAll(/(^|\s)([A-Da-d])[ \t]*(?:[.)\-:][.,)]*)[ \t]*/g)]
      .filter((match) => match.index === 0 || match[2] === match[2].toUpperCase())
      .map((match) => ({
        id: match[2].toUpperCase(),
        row,
        start: match.index + match[1].length,
        end: match.index + match[0].length,
      })),
  );

  const atLineStart = markers.filter((marker) => marker.start === 0);
  if (atLineStart.map((marker) => marker.id).join("") === "ABBC") {
    return atLineStart;
  }

  let best: OptionMarker[] = [];
  let bestWeight = -1;
  for (const [index, start] of markers.entries()) {
    const sequence = [start];
    for (let next = index + 1; next < markers.length; next += 1) {
      const candidate = markers[next];
      if (candidate.id === "A") break;
      const last = sequence[sequence.length - 1];
      if (candidate.id > last.id) sequence.push(candidate);
      else if (candidate.id === last.id && candidate.start === 0 && last.start !== 0) {
        sequence[sequence.length - 1] = candidate;
      }
    }
    // Prefer complete sequences and physical line starts. Later ties can be
    // the actual choices after a wrapped stem containing a name such as “A.”.
    const weight = sequence.length * 10 + sequence.reduce((sum, marker) => sum + Number(marker.start === 0), 0);
    if (weight >= bestWeight) {
      best = sequence;
      bestWeight = weight;
    }
  }
  return best;
}

function includeUnlabeledChoice(lines: PdfTextLine[], markers: OptionMarker[]): OptionMarker[] {
  if (markers.map((marker) => marker.id).join("") !== "ABC" || markers.some((marker) => marker.start !== 0)) {
    return markers;
  }
  const [a, b, c] = markers;
  const aboveA = lines[a.row - 1];
  const stemEnd = lines[a.row - 2];
  if (stemEnd && aboveA && /[?:]$/u.test(stemEnd.text)
    && aboveA.left !== undefined && stemEnd.left !== undefined && lines[a.row].left !== undefined
    && aboveA.left > stemEnd.left + 8 && aboveA.left >= lines[a.row].left!
    && /^\p{Lu}.*[.]$/u.test(aboveA.text)) {
    return [{ id: "", row: a.row - 1, start: 0, end: 0 }, ...markers];
  }

  const quantity = /^\d+(?:[.,]\d+)?\s+(\p{L}+(?:\s+\p{L}+)?)\.?$/u;
  if (c.row === b.row + 2) {
    const unit = (marker: OptionMarker) => lines[marker.row].text.slice(marker.end).match(quantity)?.[1];
    const unlabeledUnit = lines[b.row + 1].text.match(quantity)?.[1];
    if (unlabeledUnit && unlabeledUnit === unit(b) && unlabeledUnit === unit(c)) {
      return [a, b, { id: "", row: b.row + 1, start: 0, end: 0 }, c];
    }
  }
  return markers;
}

function between(lines: PdfTextLine[], from: { row: number; column: number }, to?: { row: number; column: number }): string {
  return normalizeText(lines.slice(from.row, to ? to.row + 1 : undefined).map(({ text }, index, selected) =>
    text.slice(index === 0 ? from.column : 0, to && index === selected.length - 1 ? to.column : undefined),
  ).join(" "));
}

function parseBlock(number: number, lines: PdfTextLine[]) {
  const metadataAt = lines.findIndex(({ text }) => answer.test(text) || explanationPrefix.test(text));
  const body = metadataAt === -1 ? lines : lines.slice(0, metadataAt);
  const markers = includeUnlabeledChoice(body, optionSequence(body));
  const first = markers[0];
  const content = between(body, { row: 0, column: 0 }, first && { row: first.row, column: first.start });
  const options: QuestionOption[] = [];
  const redOptions: string[] = [];
  const printedLabels = new Map<string, string[]>();
  const reletter = markers.some((marker) => !marker.id) || new Set(markers.map((marker) => marker.id)).size !== markers.length;
  for (const [index, marker] of markers.entries()) {
    const next = markers[index + 1];
    const text = between(body, { row: marker.row, column: marker.end }, next && { row: next.row, column: next.start });
    if (!text) continue;
    const id = reletter ? "ABCD"[index] : marker.id;
    options.push({ id, text });
    if (marker.id) printedLabels.set(marker.id, [...(printedLabels.get(marker.id) ?? []), id]);
    const end = next?.row === marker.row ? next.start : undefined;
    if (isRed(body[marker.row], marker.end, end)) redOptions.push(id);
  }

  const metadata = metadataAt === -1 ? [] : lines.slice(metadataAt);
  const explicitAnswers = metadata.flatMap(({ text }) => {
    const match = text.match(answer);
    if (!match) return [];
    return match[1].toUpperCase().split(/\s*(?:[,;/+&]|VÀ|AND)\s*/u)
      .map((id) => printedLabels.get(id)?.length === 1 ? printedLabels.get(id)![0] : "");
  });
  const explainAt = metadata.findIndex(({ text }) => explanationPrefix.test(text));
  const explanation = explainAt < 0 ? undefined : normalizeText(metadata.slice(explainAt)
    .filter(({ text }) => !answer.test(text))
    .map(({ text }) => text.replace(explanationPrefix, "")).join(" ")) || undefined;
  const stemRed = body.slice(0, first ? first.row + 1 : undefined).some((line, index) =>
    isRed(line, 0, index === first?.row ? first.start : undefined),
  );
  return { number, content, options, redOptions, explicitAnswers, explanation, stemRed };
}

export function parseQuestionsFromLines(rawLines: readonly PdfTextLine[], sourceFile?: string): ParsedQuestion[] {
  const numberedTable = rawLines.some(({ text }) => /^\s*STT(?:\s+(?:Nội dung|Questions?)|\s*$)/iu.test(text))
    && rawLines.some(({ tableIndex }) => tableIndex);
  const blocks: Array<{ number: number; lines: PdfTextLine[] }> = [];
  for (const line of logicalLines(rawLines)) {
    if (numberedTable) {
      if (line.tableIndex) {
        const rest = trimLine(sliceLine(line, line.tableIndex.end));
        blocks.push({ number: line.tableIndex.number, lines: rest.text ? [rest] : [] });
      } else {
        blocks.at(-1)?.lines.push(line);
      }
      continue;
    }
    const current = blocks.at(-1);
    const strong = line.text.match(explicitNumber) ?? line.text.match(punctuatedNumber);
    const weak = line.text.match(bareNumber);
    const weakBoundary = weak && (!current || Number(weak[1]) === current.number + 1);
    const match = strong ?? (weakBoundary ? weak : null);
    if (match) {
      const rest = trimLine(sliceLine(line, match[0].length));
      blocks.push({ number: Number(match[1]), lines: rest.text ? [rest] : [] });
    } else {
      current?.lines.push(line);
    }
  }

  const parsed = blocks.map(({ number, lines }) => parseBlock(number, lines))
    .filter(({ content, options }) => content || options.length);
  const colorCandidates = parsed.filter(({ options, redOptions, stemRed }) =>
    !stemRed && redOptions.length >= 1 && redOptions.length < options.length,
  );
  // An isolated red word or an all-red question is insufficient evidence.
  const usesRedAnswers = colorCandidates.length >= 2;
  const now = new Date().toISOString();
  return parsed.map(({ number, content, options, redOptions, explicitAnswers, explanation }) => {
    const candidates = explicitAnswers.length ? explicitAnswers
      : usesRedAnswers && redOptions.length < options.length ? redOptions : [];
    const validAnswers = candidates.every((id) => options.some((option) => option.id === id));
    const correctAnswer = validAnswers ? [...new Set(candidates)] : [];
    const reviewReason = !content ? "Thiếu nội dung câu hỏi"
      : options.length < 2 ? "Thiếu lựa chọn đáp án"
      : !validAnswers ? "Đáp án không khớp với các lựa chọn"
      : correctAnswer.length === 0 ? "Chưa nhận diện được đáp án đúng"
      : undefined;
    return {
      id: globalThis.crypto?.randomUUID?.() ?? `question-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sourceNumber: number,
      content,
      options,
      correctAnswer,
      explanation,
      subject: "Chưa phân loại",
      difficulty: "medium",
      questionType: correctAnswer.length > 1 ? "multiple" : "single",
      sourceFile,
      createdAt: now,
      updatedAt: now,
      needsReview: Boolean(reviewReason),
      reviewReason,
    };
  });
}

export function parseQuestionsFromText(rawText: string, sourceFile?: string): ParsedQuestion[] {
  return parseQuestionsFromLines(rawText.split(/\r\n?|\n/u).map((text) => ({ text })), sourceFile);
}
