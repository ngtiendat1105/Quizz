import { QuizRunner } from "@/components/quiz/QuizRunner";
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <QuizRunner id={id} />; }
