import { NextResponse } from "next/server";

import {
  buildAnswerModal,
  buildAnswerReceipt,
  buildUnavailableReply,
  FIELD_FU,
  FIELD_HAN,
  FIELD_SCORE,
  quizIdFromCustomId,
} from "@/lib/discord/quizMessage";
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
import { parseCount, parseScore } from "@/lib/quiz/answer";
import { loadQuiz, recordAnswer } from "@/lib/quiz/daily";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Discord interactions endpoint (buttons and modals for the daily quiz).
 *
 * Discord requires a reply within three seconds and verifies the endpoint by
 * sending deliberately invalid signatures, so every request is checked before
 * it is parsed. Everything this route does is a couple of indexed queries, well
 * inside the budget.
 */
export async function POST(req: Request) {
  if (!getApplicationPublicKey()) {
    return NextResponse.json({ error: "DISCORD_PUBLIC_KEY is not set." }, { status: 503 });
  }

  // The signature covers the exact bytes Discord sent, so verify before parsing.
  const rawBody = await req.text();
  if (!(await verifyInteractionSignature(req, rawBody))) {
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

  if (interaction.type === InteractionType.MessageComponent) {
    return NextResponse.json(await handleButton(interaction));
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    return NextResponse.json(await handleModalSubmit(interaction));
  }

  return NextResponse.json(ephemeralReply("Unsupported interaction."));
}

async function handleButton(interaction: Interaction) {
  const quizId = quizIdFromCustomId(interaction.data?.custom_id ?? "");
  if (!quizId) return ephemeralReply("That button is no longer valid.");

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The quiz database is not configured.");

  const quiz = await loadQuiz(supabase, quizId);
  if (!quiz) return buildUnavailableReply("That quiz is no longer available.");
  if (quiz.revealed_at) {
    return buildUnavailableReply("This hand has already been revealed — answering is closed.");
  }

  return buildAnswerModal(quizId, quiz.hand_json);
}

async function handleModalSubmit(interaction: Interaction) {
  const quizId = quizIdFromCustomId(interaction.data?.custom_id ?? "");
  if (!quizId) return ephemeralReply("That form is no longer valid.");

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
        "Could not read that answer, so nothing was recorded — press **Answer** again.",
        "",
        "Han and fu should be plain numbers (`3`, `30`).",
        "Score can be a total (`3900`) or a tsumo split (`1300/2600`, `2000 all`).",
      ].join("\n")
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The quiz database is not configured.");

  const quiz = await loadQuiz(supabase, quizId);
  if (!quiz) return ephemeralReply("That quiz is no longer available.");

  const result = await recordAnswer(
    supabase,
    quiz,
    { id: user.id, username: user.username },
    { han, fu, score },
    scoreText
  );

  if (result.status === "closed") {
    return ephemeralReply("This hand has already been revealed — answering is closed.");
  }
  if (result.status === "already_answered") {
    return ephemeralReply("You have already answered today's hand. Check back at 10pm ET.");
  }

  return ephemeralReply(buildAnswerReceipt({ han, fu, score }, result.grade));
}
