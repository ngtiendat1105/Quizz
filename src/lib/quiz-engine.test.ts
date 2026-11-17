import { describe, expect, it } from "vitest";
import { answerIsCorrect, calculateScore, shuffle } from "@/lib/quiz-engine";
import type { Question } from "@/types";

const question: Question = { id: "q1", content: "2 + 2 = ?", options: [{ id: "A", text: "3" }, { id: "B", text: "4" }], correctAnswer: ["B"], subject: "Math", difficulty: "easy", questionType: "single", createdAt: "2026-01-01", updatedAt: "2026-01-01" };

describe("quiz engine", () => {
  it("validates single and multiple answer sets without depending on order", () => { expect(answerIsCorrect(question, ["B"])).toBe(true); expect(answerIsCorrect(question, ["A"])).toBe(false); });
  it("shuffles without changing the item set", () => { const items = [1, 2, 3, 4]; expect(shuffle(items).sort()).toEqual(items); });
  it("calculates correct, wrong, unanswered and score", () => { const session = { id: "s1", name: "Test", questions: [{ question, options: question.options }], settings: { mode: "practice" as const, shuffleQuestions: false, shuffleAnswers: false, showExplanation: true }, answers: { q1: ["B"] }, marked: [], startedAt: "2026-01-01" }; expect(calculateScore(session)).toEqual({ totalQuestions: 1, correctAnswers: 1, wrongAnswers: 0, unanswered: 0, score: 100 }); });
});
