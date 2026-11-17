import type { Difficulty, Question, QuestionOption, QuestionType } from "@/types";

export interface ParsedQuestion extends Question {
  needsReview: boolean;
  reviewReason?: string;
}

function normalizeLine(line: string): string {
  return line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `question-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseOption(line: string): QuestionOption | null {
  const match = line.match(/^([A-D])\s*[.)\-:]\s*(.+)$/i);
  return match ? { id: match[1].toUpperCase(), text: match[2].trim() } : null;
}

function parseCorrectAnswer(line: string): string[] | null {
  const match = line.match(/^(?:đáp\s*án|đáp án đúng|answer|correct answer)\s*[:\-]?\s*([A-D](?:\s*[,;/]\s*[A-D])*)/i);
  if (!match) return null;
  return match[1].toUpperCase().split(/\s*[,;/]\s*/).filter(Boolean);
}

function parseDifficulty(text: string): Difficulty {
  if (/khó|hard/i.test(text)) return "hard";
  if (/dễ|easy/i.test(text)) return "easy";
  return "medium";
}

export function parseQuestionsFromText(rawText: string, sourceFile?: string): ParsedQuestion[] {
  const normalizedText = rawText
    .replace(/\r/g, "")
    .replace(/\s+(?=(?:câu\s*)?\d+\s*[.)\-:])/gi, "\n")
    .replace(/\s+(?=[A-D]\s*[.)\-:])/g, "\n")
    .replace(/\s+(?=(?:đáp\s*án|answer|correct answer)\s*[:\-])/gi, "\n")
    .replace(/\s+(?=(?:giải thích|explanation)\s*[:\-])/gi, "\n");
  const lines = normalizedText.split(/\n/).map(normalizeLine).filter(Boolean);
  const starts = lines.map((line, index) => (/^(?:câu\s*)?\d+\s*[.)\-:]/i.test(line) ? index : -1)).filter((index) => index >= 0);
  const blocks = starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length));

  return blocks.map((block) => {
    const first = block[0].replace(/^(?:câu\s*)?\d+\s*[.)\-:]\s*/i, "");
    const options: QuestionOption[] = [];
    const questionLines: string[] = [first];
    let correctAnswer: string[] = [];
    let explanation = "";
    let inExplanation = false;

    block.slice(1).forEach((line) => {
      const option = parseOption(line);
      const answer = parseCorrectAnswer(line);
      if (option && !inExplanation) options.push(option);
      else if (answer) correctAnswer = answer;
      else if (/^(?:giải thích|explanation)\s*[:\-]?/i.test(line)) { inExplanation = true; explanation = line.replace(/^(?:giải thích|explanation)\s*[:\-]?\s*/i, ""); }
      else if (inExplanation) explanation += ` ${line}`;
      else questionLines.push(line);
    });

    const questionType: QuestionType = correctAnswer.length > 1 ? "multiple" : "single";
    const needsReview = options.length < 2 || correctAnswer.length === 0 || correctAnswer.some((answer) => !options.some((option) => option.id === answer));
    const reviewReason = options.length < 2 ? "Thiếu lựa chọn đáp án" : correctAnswer.length === 0 ? "Chưa nhận diện được đáp án đúng" : undefined;
    const now = new Date().toISOString();
    return {
      id: makeId(), content: questionLines.join(" "), options, correctAnswer, explanation: explanation || undefined,
      subject: "Chưa phân loại", difficulty: parseDifficulty(block.join(" ")), questionType, sourceFile,
      createdAt: now, updatedAt: now, needsReview, reviewReason,
    };
  });
}
