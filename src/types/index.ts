export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "single" | "multiple";

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  content: string;
  options: QuestionOption[];
  correctAnswer: string[];
  explanation?: string;
  subject: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  sourceFile?: string;
  isImportant?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuizResult {
  id: string;
  quizName: string;
  mode: "practice" | "exam";
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  score: number;
  duration: number;
  completedAt: string;
}
