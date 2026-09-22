/** Posting, answering, and revealing the daily scoring quiz. */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  editChannelMessage,
  getQuizChannelId,
  isQuizConfigured,
  postChannelMessage,
  type MessageAttachment,
} from "@/lib/discord/bot";
import {
  buildQuestionMessage,
  buildRevealMessage,
  HAND_IMAGE_FILENAME,
  type HandVisual,
} from "@/lib/discord/quizMessage";
import { loadTileEmoji } from "@/lib/discord/tileEmoji";
import { withFuBreakdown } from "@/lib/quiz/fu";
import { renderHandImage } from "@/lib/quiz/handImage";
import { generateQuizHand } from "@/lib/quiz/generate";
import type { QuizHand } from "@/lib/quiz/hand";
import { createRandom, hashSeed } from "@/lib/quiz/random";
import { quizDate } from "@/lib/quiz/schedule";
import {
  QUIZZES_TABLE,
  countAnswers,
  findQuizByDate,
  type AnswerCounts,
  type QuizRow,
} from "@/lib/quiz/store";

export type { AnswerResult, QuizRow } from "@/lib/quiz/store";

/**
 * Draws the hand, falling back to inline emoji if rendering fails.
 *
 * Image rendering is the one part of a post that depends on native code and the
 * bundled tile assets, so it is the part most likely to behave differently in
 * production. A failure should cost us the picture, not the day's quiz.
 */
async function buildHandVisual(
  hand: QuizHand,
  channelId: string
): Promise<{ visual: HandVisual; files: MessageAttachment[] }> {
  try {
    const image = await renderHandImage(hand);
    return {
      visual: { kind: "image", filename: HAND_IMAGE_FILENAME },
      files: [{ filename: HAND_IMAGE_FILENAME, data: image }],
    };
  } catch (e) {
    console.error("[quiz] hand image failed, falling back to emoji:", e);
    return { visual: { kind: "emoji", emoji: await loadTileEmoji(channelId) }, files: [] };
  }
}

export type PostResult =
  | { status: "posted"; quizId: string; messageId: string }
  | { status: "skipped"; reason: string };

export type RevealResult =
  | {
      status: "revealed";
      quizId: string;
      answers: number;
      correct: number;
      /** The subset that came through the multiple-choice form. */
      beginner: AnswerCounts;
    }
  | { status: "skipped"; reason: string };

/**
 * Posts today's hand, unless one is already up.
 *
 * The hand is seeded from the date, so a retried cron run rebuilds the same
 * hand rather than a different one — and the unique index on `quiz_date` stops
 * a second message either way.
 */
export async function postDailyQuiz(supabase: SupabaseClient): Promise<PostResult> {
  if (!isQuizConfigured()) {
    return {
      status: "skipped",
      reason: "DISCORD_BOT_TOKEN and DISCORD_QUIZ_CHANNEL_ID must both be set.",
    };
  }
  const channelId = getQuizChannelId() as string;
  const today = quizDate();

  const existing = await findQuizByDate(supabase, today);

  // A row with no message_id is a previous run that stored its hand and then
  // failed to reach Discord. Retry that same hand rather than refusing for the
  // rest of the day, which would leave the channel with no quiz at all.
  if (existing?.message_id) {
    return { status: "skipped", reason: `A quiz is already posted for ${today}.` };
  }

  let quizId: string;
  let hand: QuizHand;

  if (existing) {
    quizId = existing.id;
    hand = existing.hand_json;
  } else {
    const generated = generateQuizHand(createRandom(hashSeed(`quiz-${today}`)));
    hand = generated.hand;

    // Not a reason to hold the post — the answer is still right — but worth
    // knowing: it means a shape the fu explainer could not read back.
    if (!generated.solved.fuBreakdown) {
      console.warn("[quiz] no fu breakdown for today's hand", { today });
    }

    // Insert before posting: if two cron invocations race, the unique index on
    // quiz_date decides the winner and the loser never reaches Discord.
    const { data, error } = await supabase
      .from(QUIZZES_TABLE)
      .insert({
        quiz_date: today,
        channel_id: channelId,
        hand_json: generated.hand,
        answer_json: generated.solved,
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique violation, i.e. another run got there first.
      if (error.code === "23505") {
        return { status: "skipped", reason: `A quiz is already posted for ${today}.` };
      }
      throw new Error(error.message);
    }
    quizId = data.id as string;
  }

  const { visual, files } = await buildHandVisual(hand, channelId);
  const posted = await postChannelMessage(
    channelId,
    buildQuestionMessage(quizId, hand, today, visual),
    files
  );

  const { error: updateError } = await supabase
    .from(QUIZZES_TABLE)
    .update({ message_id: posted.id })
    .eq("id", quizId);
  if (updateError) throw new Error(updateError.message);

  return { status: "posted", quizId, messageId: posted.id };
}

/**
 * Reveals the most recent quiz that is still open.
 *
 * Looks past today deliberately: if a reveal run is missed, the next one should
 * still close out the stale hand rather than leave a live button in the channel.
 */
export async function revealDailyQuiz(supabase: SupabaseClient): Promise<RevealResult> {
  if (!isQuizConfigured()) {
    return {
      status: "skipped",
      reason: "DISCORD_BOT_TOKEN and DISCORD_QUIZ_CHANNEL_ID must both be set.",
    };
  }

  const { data, error } = await supabase
    .from(QUIZZES_TABLE)
    .select("id, quiz_date, channel_id, message_id, hand_json, answer_json, revealed_at")
    .is("revealed_at", null)
    .not("message_id", "is", null)
    .order("quiz_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { status: "skipped", reason: "No unrevealed quiz to close." };

  const quiz = data as QuizRow;
  const recap = await countAnswers(supabase, quiz.id);

  // Close answering first. Marking it revealed is what the interaction handler
  // checks, so doing this before posting means a late click is refused even if
  // the reveal post itself fails.
  const { error: closeError } = await supabase
    .from(QUIZZES_TABLE)
    .update({ revealed_at: new Date().toISOString() })
    .eq("id", quiz.id)
    .is("revealed_at", null);
  if (closeError) throw new Error(closeError.message);

  const { visual, files } = await buildHandVisual(quiz.hand_json, quiz.channel_id);
  await postChannelMessage(
    quiz.channel_id,
    buildRevealMessage(
      quiz.hand_json,
      // A hand posted before the fu lines existed gets them worked out now.
      withFuBreakdown(quiz.hand_json, quiz.answer_json),
      recap,
      quiz.quiz_date,
      visual
    ),
    files
  );

  // Drop the Answer button from the original post so it stops inviting clicks.
  if (quiz.message_id) {
    await editChannelMessage(quiz.channel_id, quiz.message_id, { components: [] }).catch(
      (e) => {
        console.error("[quiz] could not strip the answer button:", e);
      }
    );
  }

  return {
    status: "revealed",
    quizId: quiz.id,
    answers: recap.answers,
    correct: recap.correct,
    beginner: recap.beginner,
  };
}
