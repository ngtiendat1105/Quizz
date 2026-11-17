import { describe, expect, it } from "vitest";
import { parseQuestionsFromText } from "@/lib/question-parser";

describe("question parser", () => {
  it("parses questions, options, correct answers and explanations", () => {
    const parsed = parseQuestionsFromText("Câu 1: Thủ đô Việt Nam là gì?\nA. Hà Nội\nB. Huế\nĐáp án: A\nGiải thích: Hà Nội là thủ đô.");
    expect(parsed).toHaveLength(1); expect(parsed[0].options).toHaveLength(2); expect(parsed[0].correctAnswer).toEqual(["A"]); expect(parsed[0].explanation).toContain("Hà Nội"); expect(parsed[0].needsReview).toBe(false);
  });
  it("does not guess a missing answer", () => {
    const parsed = parseQuestionsFromText("1. Câu hỏi chưa có đáp án\nA. Một\nB. Hai");
    expect(parsed[0].correctAnswer).toEqual([]); expect(parsed[0].needsReview).toBe(true);
  });
  it("recovers question boundaries from flattened PDF text", () => {
    const parsed = parseQuestionsFromText("Câu 1: 2 + 2 bằng bao nhiêu? A. 3 B. 4 Đáp án: B Câu 2: 1 + 1 bằng bao nhiêu? A. 2 B. 3 Đáp án: A");
    expect(parsed).toHaveLength(2); expect(parsed[0].correctAnswer).toEqual(["B"]); expect(parsed[1].correctAnswer).toEqual(["A"]);
  });
  it("recognizes numbered questions without punctuation", () => {
    const parsed = parseQuestionsFromText("Câu 133 Nhà nước là gì? A. Một tổ chức B. Một cá nhân Đáp án: A Câu 134 Pháp luật là gì? A. Quy tắc B. Ý kiến Đáp án: A");
    expect(parsed).toHaveLength(2); expect(parsed[0].content).toContain("Nhà nước"); expect(parsed[1].content).toContain("Pháp luật");
  });
});
