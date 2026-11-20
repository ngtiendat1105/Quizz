import { expect, it } from "vitest";
import { extractPdfText } from "./pdf-parser";
import { parseQuestionsFromLines } from "./question-parser";

function samplePdf(): File {
  const lines = [
    "BT /F1 10 Tf",
    "1 0 0 1 30 285 Tm (STT) Tj",
    "1 0 0 1 70 285 Tm (Questions) Tj",
    "1 0 0 1 30 265 Tm (17) Tj",
    "1 0 0 1 70 260 Tm (How many years?) Tj",
    "1 0 0 1 85 245 Tm (A. 4 years) Tj",
    "1 0 0 1 85 230 Tm (B. ) Tj",
    "1 0 0 rg (5 years) Tj",
    "0 0 0 rg 1 0 0 1 85 215 Tm (C. 6 years) Tj",
    "1 0 0 1 30 195 Tm (19) Tj",
    "1 0 0 1 70 195 Tm (Which color?) Tj",
    "1 0 0 rg 1 0 0 1 85 180 Tm (A. Red) Tj",
    "0 0 0 rg 1 0 0 1 85 165 Tm (B. Blue) Tj",
    "1 0 0 1 150 20 Tm (1) Tj",
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + lines.length + " >>\nstream\n" + lines + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += String(index + 1) + " 0 obj\n" + object + "\nendobj\n";
    return offset;
  });
  const xref = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n"
    + offsets.map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("")
    + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  return new File([pdf], "table.pdf", { type: "application/pdf" });
}

it("imports table rows and colored answer text from PDF.js", async () => {
  const pdf = await extractPdfText(samplePdf());
  const questions = parseQuestionsFromLines(pdf.lines);
  expect(questions.map((question) => question.sourceNumber)).toEqual([17, 19]);
  expect(questions[0].options.map((option) => option.text)).toEqual(["4 years", "5 years", "6 years"]);
  expect(questions.map((question) => question.correctAnswer)).toEqual([["B"], ["A"]]);
});
