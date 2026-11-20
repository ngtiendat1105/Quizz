"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, FileUp, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { extractPdfText } from "@/lib/pdf-parser";
import { parseQuestionsFromLines, type ParsedQuestion } from "@/lib/question-parser";
import { db } from "@/lib/storage";

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "processing" | "ready" | "error" | "saved">("idle");
  const [message, setMessage] = useState("");

  async function processFile(file?: File) {
    if (!file) return;
    setFileName(file.name); setStatus("processing"); setProgress(0); setMessage("");
    try {
      const extracted = await extractPdfText(file, setProgress);
      if (!extracted.text.trim()) throw new Error("PDF không có lớp văn bản. Tài liệu scan cần OCR, tính năng sẽ được bổ sung sau.");
      const parsed = parseQuestionsFromLines(extracted.lines, file.name);
      if (!parsed.length) throw new Error("Không nhận diện được câu hỏi. Hãy kiểm tra định dạng PDF hoặc thêm câu hỏi thủ công.");
      setQuestions(parsed); setStatus("ready");
      const reviewCount = parsed.filter((question) => question.needsReview).length;
      setMessage(`${extracted.pageCount} trang · ${parsed.length} câu hỏi · ${parsed.length - reviewCount} câu có đáp án · ${reviewCount} câu cần kiểm tra${extracted.emptyPages ? ` · ${extracted.emptyPages} trang không có văn bản` : ""}`);
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Không thể xử lý PDF."); }
  }

  function updateQuestion(index: number, patch: Partial<ParsedQuestion>) { setQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch, updatedAt: new Date().toISOString() } : question)); }
  function addManualQuestion() { const now = new Date().toISOString(); setQuestions((current) => [...current, { id: `manual-${Date.now()}`, content: "", options: [{ id: "A", text: "" }, { id: "B", text: "" }, { id: "C", text: "" }, { id: "D", text: "" }], correctAnswer: [], subject: "Chưa phân loại", difficulty: "medium", questionType: "single", sourceFile: fileName || undefined, createdAt: now, updatedAt: now, needsReview: true, reviewReason: "Câu hỏi thủ công chưa hoàn thiện" }]); setStatus("ready"); }
  async function saveQuestions() { const valid = questions.filter((question) => question.content.trim() && question.options.filter((option) => option.text.trim()).length >= 2); if (!valid.length) { setMessage("Cần ít nhất một câu hỏi có nội dung và từ hai đáp án."); return; } await db.questions.bulkPut(valid.map(({ needsReview: _needsReview, reviewReason: _reviewReason, ...question }) => question)); setStatus("saved"); setMessage(`${valid.length} câu hỏi đã được lưu vào ngân hàng.`); }

  return <div className="min-h-screen p-5 md:p-10"><div className="mx-auto max-w-5xl"><Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600"><ArrowLeft size={16}/>Quay về Dashboard</Link><div className="mb-8"><p className="mb-2 text-sm font-semibold text-blue-600">PHASE 2 · PDF IMPORT</p><h1 className="text-3xl font-bold text-slate-900">Import câu hỏi từ PDF</h1><p className="mt-2 text-slate-500">Trích xuất, kiểm tra và chỉnh sửa trước khi lưu vào ngân hàng.</p></div>
    {status === "idle" || status === "processing" || status === "error" ? <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void processFile(event.dataTransfer.files[0]); }} className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><FileUp size={30}/></div><h2 className="font-semibold text-slate-800">Kéo thả PDF vào đây</h2><p className="mt-2 text-sm text-slate-500">hoặc chọn file từ thiết bị của bạn</p><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void processFile(event.target.files?.[0])}/><button onClick={() => inputRef.current?.click()} disabled={status === "processing"} className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{status === "processing" ? <span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin"/>Đang xử lý {progress}%</span> : "Chọn file PDF"}</button>{status === "processing" && <div className="mx-auto mt-6 max-w-md"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }}/></div><p className="mt-2 text-xs text-slate-400">Đang đọc {fileName}</p></div>}{status === "error" && <div className="mx-auto mt-5 flex max-w-xl items-start gap-3 rounded-xl bg-red-50 p-4 text-left text-sm text-red-700"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><span>{message}</span></div>}<p className="mt-5 text-xs text-slate-400">PDF scan không có text sẽ được thông báo để chờ OCR.</p></div> : null}
    {(status === "ready" || status === "saved") && <><div className="mb-5 flex flex-col justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 md:flex-row md:items-center"><span className="flex items-center gap-2"><Check size={17}/>{message}</span><button onClick={() => { setQuestions([]); setStatus("idle"); setFileName(""); }} className="flex items-center gap-1 font-semibold hover:underline"><X size={15}/>Đóng preview</button></div><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Kiểm tra câu hỏi</h2><p className="text-sm text-slate-500">Chỉnh sửa dữ liệu trước khi lưu. Câu hỏi thiếu đáp án được đánh dấu cảnh báo.</p></div><div className="flex gap-2"><button onClick={addManualQuestion} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><Plus size={16}/>Thêm thủ công</button><button onClick={() => void saveQuestions()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200"><Check size={16}/>Lưu vào ngân hàng</button></div></div><div className="space-y-4">{questions.map((question, index) => <QuestionEditor key={question.id} question={question} index={index} onChange={updateQuestion} onDelete={() => setQuestions((current) => current.filter((_, i) => i !== index))}/>)}</div></>}
  </div></div>;
}

function QuestionEditor({ question, index, onChange, onDelete }: {
  question: ParsedQuestion;
  index: number;
  onChange: (index: number, patch: Partial<ParsedQuestion>) => void;
  onDelete: () => void;
}) {
  const nextOption = [..."ABCD"].find((id) => !question.options.some((option) => option.id === id));
  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500";
  const selected = question.correctAnswer;

  function edit(patch: Partial<ParsedQuestion>) {
    const updated = { ...question, ...patch };
    const choices = updated.options.filter(({ text }) => text.trim());
    const reviewReason = !updated.content.trim() ? "Thiếu nội dung câu hỏi"
      : choices.length < 2 ? "Thiếu lựa chọn đáp án"
      : updated.correctAnswer.length === 0 ? "Chưa nhận diện được đáp án đúng"
      : updated.correctAnswer.some((id) => !choices.some((option) => option.id === id))
        ? "Đáp án đúng đang để trống"
        : undefined;
    onChange(index, {
      ...patch,
      questionType: updated.correctAnswer.length > 1 ? "multiple" : "single",
      needsReview: Boolean(reviewReason),
      reviewReason,
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span title={question.sourceNumber === undefined ? undefined : "Số câu trong PDF"}
            className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-slate-100 px-1.5 text-sm font-bold text-slate-500">
            {question.sourceNumber ?? index + 1}
          </span>
          {question.needsReview && (
            <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
              <AlertTriangle size={13} />Cần kiểm tra: {question.reviewReason}
            </span>
          )}
        </div>
        <button type="button" onClick={onDelete} className="text-slate-400 hover:text-red-500" aria-label="Xóa câu hỏi">
          <Trash2 size={18} />
        </button>
      </div>
      <textarea aria-label="Nội dung câu hỏi" value={question.content} onChange={(event) => edit({ content: event.target.value })}
        placeholder="Nội dung câu hỏi" rows={2} className={`${inputClass} resize-y`} />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {question.options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <button type="button" aria-label={`Đánh dấu đáp án ${option.id} là đúng`} aria-pressed={selected.includes(option.id)}
              title="Chọn đáp án đúng"
              onClick={() => edit({ correctAnswer: selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id] })}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected.includes(option.id) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {option.id}
            </button>
            <input aria-label={`Lựa chọn ${option.id}`} value={option.text}
              onChange={(event) => edit({ options: question.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) })}
              placeholder={`Đáp án ${option.id}`} className={inputClass} />
          </div>
        ))}
      </div>
      {nextOption && (
        <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
          onClick={() => edit({ options: [...question.options, { id: nextOption, text: "" }].sort((a, b) => a.id.localeCompare(b.id)) })}>
          <Plus size={15} />Thêm lựa chọn {nextOption}
        </button>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input aria-label="Môn học" value={question.subject} onChange={(event) => edit({ subject: event.target.value })}
          placeholder="Môn học" className={inputClass} />
        <select aria-label="Độ khó" value={question.difficulty}
          onChange={(event) => edit({ difficulty: event.target.value as ParsedQuestion["difficulty"] })} className={inputClass}>
          <option value="easy">Dễ</option>
          <option value="medium">Trung bình</option>
          <option value="hard">Khó</option>
        </select>
      </div>
      <textarea aria-label="Giải thích" value={question.explanation ?? ""} onChange={(event) => edit({ explanation: event.target.value })}
        placeholder="Giải thích (không bắt buộc)" rows={2} className={`${inputClass} mt-3 resize-y`} />
    </section>
  );
}
