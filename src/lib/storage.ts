import Dexie, { type Table } from "dexie";
import type { Question, QuizResult } from "@/types";

class QuizDatabase extends Dexie {
  questions!: Table<Question, string>;
  results!: Table<QuizResult, string>;

  constructor() {
    super("quiz-platform-db");
    this.version(1).stores({
      questions: "id, subject, difficulty, createdAt, isImportant",
      results: "id, completedAt, mode",
    });
  }
}

export const db = new QuizDatabase();

export async function getQuestions(): Promise<Question[]> {
  return db.questions.orderBy("createdAt").reverse().toArray();
}

export async function deleteQuestion(id: string): Promise<void> {
  await db.questions.delete(id);
}

export async function toggleQuestionImportant(question: Question): Promise<void> {
  await db.questions.update(question.id, { isImportant: !question.isImportant, updatedAt: new Date().toISOString() });
}

export async function getResults(): Promise<QuizResult[]> {
  return db.results.orderBy("completedAt").reverse().toArray();
}

export async function deleteResult(id: string): Promise<void> {
  await db.results.delete(id);
}

export async function clearAllData(): Promise<void> {
  await db.questions.clear();
  await db.results.clear();
}

export async function exportData(): Promise<{ questions: Question[]; results: QuizResult[] }> {
  return { questions: await db.questions.toArray(), results: await db.results.toArray() };
}

export async function importData(data: { questions?: Question[]; results?: QuizResult[] }): Promise<void> {
  if (data.questions) await db.questions.bulkPut(data.questions);
  if (data.results) await db.results.bulkPut(data.results);
}
