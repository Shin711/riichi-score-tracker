/**
 * Quiz rows and answers in Supabase.
 *
 * Kept separate from `@/lib/quiz/daily` so the Discord interactions endpoint
 * can read and write answers without loading the generator, the wasm solver,
 * or sharp. Discord must get a reply within three seconds and cannot defer a
 * modal, so that cold-start cost would show up as "This interaction failed".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { gradeAnswer, type QuizAnswer } from "@/lib/quiz/answer";
import type { QuizHand } from "@/lib/quiz/hand";
import type { SolvedHand } from "@/lib/quiz/solve";

export const QUIZZES_TABLE = "discord_quizzes";
export const ANSWERS_TABLE = "discord_quiz_answers";

export type QuizRow = {
  id: string;
  quiz_date: string;
  channel_id: string;
  message_id: string | null;
  hand_json: QuizHand;
  answer_json: SolvedHand;
  revealed_at: string | null;
};

export type AnswerResult =
  | { status: "recorded"; grade: ReturnType<typeof gradeAnswer> }
  | { status: "already_answered" }
  | { status: "closed" };

const QUIZ_COLUMNS =
  "id, quiz_date, channel_id, message_id, hand_json, answer_json, revealed_at";

export async function loadQuiz(
  supabase: SupabaseClient,
  quizId: string
): Promise<QuizRow | null> {
  const { data, error } = await supabase
    .from(QUIZZES_TABLE)
    .select(QUIZ_COLUMNS)
    .eq("id", quizId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as QuizRow | null) ?? null;
}

export async function findQuizByDate(
  supabase: SupabaseClient,
  isoDate: string
): Promise<QuizRow | null> {
  const { data, error } = await supabase
    .from(QUIZZES_TABLE)
    .select(QUIZ_COLUMNS)
    .eq("quiz_date", isoDate)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as QuizRow | null) ?? null;
}

export async function countAnswers(
  supabase: SupabaseClient,
  quizId: string
): Promise<{ answers: number; correct: number }> {
  const { data, error } = await supabase
    .from(ANSWERS_TABLE)
    .select("correct")
    .eq("quiz_id", quizId);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ correct: boolean }>;
  return {
    answers: rows.length,
    correct: rows.filter((row) => row.correct).length,
  };
}

/**
 * Grades and stores one person's answer. The composite primary key is what
 * enforces a single attempt — a second submission conflicts rather than
 * overwriting, so nobody can retry their way to a correct answer.
 */
export async function recordAnswer(
  supabase: SupabaseClient,
  quiz: QuizRow,
  user: { id: string; username: string },
  answer: QuizAnswer,
  scoreText: string
): Promise<AnswerResult> {
  if (quiz.revealed_at) return { status: "closed" };

  const grade = gradeAnswer(quiz.answer_json, answer);

  const { error } = await supabase.from(ANSWERS_TABLE).insert({
    quiz_id: quiz.id,
    discord_user_id: user.id,
    discord_username: user.username,
    han: answer.han,
    fu: answer.fu,
    score_text: scoreText,
    correct: grade.correct,
  });

  if (error) {
    if (error.code === "23505") return { status: "already_answered" };
    throw new Error(error.message);
  }

  return { status: "recorded", grade };
}
