import { NextResponse } from "next/server";

import { getApprovalChannelId } from "@/lib/discord/bot";
import { parseChangeRequestCustomId } from "@/lib/discord/changeRequestMessage";

import {
  buildAlreadyAnsweredReply,
  buildAnswerModal,
  buildAnswerReceipt,
  buildBeginnerModal,
  buildUnavailableReply,
  FIELD_FU,
  FIELD_HAN,
  FIELD_SCORE,
  parseCustomId,
} from "@/lib/discord/quizForm";
import {
  ephemeralReply,
  getApplicationPublicKey,
  InteractionResponseType,
  InteractionType,
  interactionUser,
  modalValues,
  verifyInteractionSignature,
  type Interaction,
} from "@/lib/discord/interactions";
import { decideGameChange } from "@/lib/imports/changeRequests";
import { parseCount, parseScore, type AnswerMode } from "@/lib/quiz/answer";
import { withFuBreakdown } from "@/lib/quiz/fu";
import { loadQuiz, recordAnswer } from "@/lib/quiz/store";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Discord interactions endpoint (buttons and modals for the daily quiz).
 *
 * Discord requires a reply within three seconds and cannot defer a modal, so
 * this module must stay small. Do not import `@/lib/quiz/daily` (or anything
 * else that pulls in `riichi-rs-node` / `sharp`): a cold start that loads the
 * wasm solver is enough to miss the deadline and show "This interaction failed"
 * on the first click of the day.
 *
 * Discord also verifies the endpoint by sending deliberately invalid
 * signatures, so every request is checked before it is parsed.
 */
export async function POST(req: Request) {
  const started = Date.now();
  if (!getApplicationPublicKey()) {
    console.error("[quiz] DISCORD_PUBLIC_KEY is not set");
    return NextResponse.json({ error: "DISCORD_PUBLIC_KEY is not set." }, { status: 503 });
  }

  // The signature covers the exact bytes Discord sent, so verify before parsing.
  const rawBody = await req.text();
  if (!(await verifyInteractionSignature(req, rawBody))) {
    console.warn("[quiz] invalid request signature", { ms: Date.now() - started });
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return NextResponse.json({ error: "Malformed interaction." }, { status: 400 });
  }

  if (interaction.type === InteractionType.Ping) {
    return NextResponse.json({ type: InteractionResponseType.Pong });
  }

  try {
    if (interaction.type === InteractionType.MessageComponent) {
      const response = await handleButton(interaction);
      console.log("[quiz] button", {
        customId: interaction.data?.custom_id,
        user: interactionUser(interaction)?.id,
        region: process.env.VERCEL_REGION ?? "local",
        ms: Date.now() - started,
      });
      return NextResponse.json(response);
    }

    if (interaction.type === InteractionType.ModalSubmit) {
      const response = await handleModalSubmit(interaction);
      console.log("[quiz] modal", {
        customId: interaction.data?.custom_id,
        user: interactionUser(interaction)?.id,
        region: process.env.VERCEL_REGION ?? "local",
        ms: Date.now() - started,
      });
      return NextResponse.json(response);
    }
  } catch (e) {
    console.error("[quiz] interaction handler failed", {
      type: interaction.type,
      customId: interaction.data?.custom_id,
      user: interactionUser(interaction)?.id,
      region: process.env.VERCEL_REGION ?? "local",
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : e,
    });
    return NextResponse.json(
      ephemeralReply("Something went wrong with that request. Press the button again.")
    );
  }

  return NextResponse.json(ephemeralReply("Unsupported interaction."));
}

async function handleButton(interaction: Interaction) {
  const changeRequest = parseChangeRequestCustomId(interaction.data?.custom_id ?? "");
  if (changeRequest) return handleChangeRequestButton(interaction, changeRequest);

  const control = parseCustomId(interaction.data?.custom_id ?? "");
  if (!control) return ephemeralReply("That button is no longer valid.");

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The quiz database is not configured.");

  const quiz = await loadQuiz(supabase, control.quizId);
  if (!quiz) return buildUnavailableReply("That quiz is no longer available.");
  if (quiz.revealed_at) {
    return buildUnavailableReply("This hand has already been revealed — answering is closed.");
  }

  // The beginner form builds its options around the answer stored at post
  // time. It must not re-solve the hand here (see the note above).
  return control.kind === "beginner"
    ? buildBeginnerModal(control.quizId, quiz.hand_json, quiz.answer_json)
    : buildAnswerModal(control.quizId, quiz.hand_json);
}

/**
 * Approve / Reject on an edit or removal request. The buttons only exist in the
 * approval channel, and only people who can see that channel can click them;
 * the channel check below makes sure a click from anywhere else never counts.
 */
async function handleChangeRequestButton(
  interaction: Interaction,
  control: NonNullable<ReturnType<typeof parseChangeRequestCustomId>>
) {
  const approvalChannelId = getApprovalChannelId();
  if (!approvalChannelId || interaction.channel_id !== approvalChannelId) {
    return ephemeralReply("Game changes can only be approved in the approval channel.");
  }

  const user = interactionUser(interaction);
  if (!user) return ephemeralReply("Could not identify who clicked that.");

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The database is not configured.");

  const result = await decideGameChange(supabase, control.requestId, control.decision, user);
  if (!result.ok) return ephemeralReply(result.message);

  // Replace the buttons with the outcome so the request can't be clicked again.
  return {
    type: InteractionResponseType.UpdateMessage,
    data: { content: result.line, components: [], allowed_mentions: { parse: [] } },
  };
}

async function handleModalSubmit(interaction: Interaction) {
  const control = parseCustomId(interaction.data?.custom_id ?? "");
  if (!control) return ephemeralReply("That form is no longer valid.");
  const mode: AnswerMode = control.kind === "beginner-modal" ? "beginner" : "typed";

  const user = interactionUser(interaction);
  if (!user) return ephemeralReply("Could not identify who submitted that answer.");

  const values = modalValues(interaction);
  const han = parseCount(values[FIELD_HAN] ?? "");
  const fu = parseCount(values[FIELD_FU] ?? "");
  const scoreText = (values[FIELD_SCORE] ?? "").trim();
  const score = parseScore(scoreText);

  if (han === null || fu === null || score === null) {
    // Nothing is stored, so they can reopen the modal and try again — a typo
    // should not burn someone's single attempt.
    return ephemeralReply(
      [
        "Could not read that answer, so nothing was recorded — press **Answer** (or **Beginner**) again.",
        "",
        "Han and fu should be plain numbers (`3`, `30`).",
        "Score can be a total (`3900`) or a tsumo split (`1300/2600`, `2000 all`).",
      ].join("\n")
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The quiz database is not configured.");

  const quiz = await loadQuiz(supabase, control.quizId);
  if (!quiz) return ephemeralReply("That quiz is no longer available.");

  const result = await recordAnswer(
    supabase,
    quiz,
    { id: user.id, username: user.username },
    { han, fu, score },
    scoreText,
    mode
  );

  if (result.status === "closed") {
    return ephemeralReply("This hand has already been revealed — answering is closed.");
  }

  // The answer comes from the row, stored when the hand was posted — never from
  // re-solving here, which would load the wasm solver (see the note above).
  // Rows from before the fu lines existed get them worked out on the spot.
  const solved = withFuBreakdown(quiz.hand_json, quiz.answer_json);
  if (result.status === "already_answered") {
    return ephemeralReply(buildAlreadyAnsweredReply(solved));
  }

  return ephemeralReply(buildAnswerReceipt({ han, fu, score }, result.grade, solved, mode));
}
