import { describe, expect, it } from "vitest";
import { parseQuestionsFromLines, parseQuestionsFromText } from "@/lib/question-parser";

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
  it("recognizes question numbers placed on their own line", () => {
    const parsed = parseQuestionsFromText("1\nCác học thuyết về Nhà nước có mục tiêu:\nA. Lý giải sự ra đời\nB. Lý giải xã hội\nC. Bảo vệ Nhà nước\nD. Ý khác\n2\nQuan điểm gia trưởng là gì?\nA. Nhà nước như gia đình\nB. Nhà nước như doanh nghiệp\nC. Nhà nước như trường học\nD. Nhà nước như quân đội");
    expect(parsed).toHaveLength(2); expect(parsed[0].content).toContain("Các học thuyết"); expect(parsed[1].content).toContain("Quan điểm gia trưởng");
  });

  it("keeps numeric answers and wrapped sentences in their original questions", () => {
    const parsed = parseQuestionsFromText([
      "17 Nhiệm kỳ là bao lâu?",
      "A. 4 năm B. 5 năm C. 6 năm D. 7 năm",
      "18 Ông Q làm việc ở Bộ",
      "A. Anh L làm cùng cơ quan.",
      "A. Kế toán",
      "quản lý tài sản",
      "B. Thủ quỹ",
      "C. Phụ trách đào tạo",
      "D. Phụ trách truyền thông",
      "Đáp án đúng: A và C",
    ].join("\n"));

    expect(parsed.map((item) => item.sourceNumber)).toEqual([17, 18]);
    expect(parsed[0].options.map((option) => option.text)).toEqual(["4 năm", "5 năm", "6 năm", "7 năm"]);
    expect(parsed[1].content).toContain("Bộ A. Anh L");
    expect(parsed[1].options[0].text).toBe("Kế toán quản lý tài sản");
    expect(parsed[1].correctAnswer).toEqual(["A", "C"]);
    expect(parsed[1].questionType).toBe("multiple");
  });

  it("uses table positions when source numbers skip and keeps years in wrapped text", () => {
    const parsed = parseQuestionsFromLines([
      { text: "STT Nội dung câu hỏi, đáp án" },
      { text: "87", tableIndex: { number: 87, end: 2 } },
      { text: "“Quy định nào đúng?”" },
      { text: "A. Lựa chọn đầu" },
      { text: "B. Lựa chọn sau" },
      { text: "2005. Đây là phần tiếp theo của lựa chọn B." },
      { text: "89 ……… điền vào chỗ trống", tableIndex: { number: 89, end: 2 } },
      { text: "A. Một" },
      { text: "B. Hai" },
    ]);

    expect(parsed.map((item) => item.sourceNumber)).toEqual([87, 89]);
    expect(parsed[0].options[1].text).toContain("2005.");
    expect(parsed[1].content).toBe("……… điền vào chỗ trống");
  });

  it("reads a repeated red-answer convention and leaves unmarked questions for review", () => {
    const red = (text: string) => ({ text, redSpans: [{ start: 0, end: text.length }] });
    const parsed = parseQuestionsFromLines([
      { text: "1. Chọn lựa chọn phù hợp." },
      { text: "A. Một" },
      red("B. Hai"),
      { text: "2. Chọn lựa chọn phù hợp." },
      red("A. Ba"),
      { text: "B. Bốn" },
      { text: "3. Chọn lựa chọn phù hợp." },
      { text: "A. Năm" },
      { text: "B. Sáu" },
      { text: "4. Chọn đáp án đã ghi rõ." },
      red("A. Bảy"),
      { text: "B. Tám" },
      { text: "Đáp án: B" },
    ]);

    expect(parsed.map((item) => item.correctAnswer)).toEqual([["B"], ["A"], [], ["B"]]);
    expect(parsed[2].needsReview).toBe(true);
  });
});
