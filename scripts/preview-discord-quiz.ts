/**
 * Prints the daily quiz messages without posting anything.
 * Run: npx tsx scripts/preview-discord-quiz.ts [count] [--date YYYY-MM-DD]
 *
 * Passing a date shows exactly the hand that day's cron would post, since the
 * generator is seeded from the date.
 */
import { describeCorrectScore } from "../src/lib/quiz/answer";
import { buildQuestionMessage, buildRevealMessage } from "../src/lib/discord/quizMessage";
import { generateQuizHand } from "../src/lib/quiz/generate";
import { createRandom, hashSeed } from "../src/lib/quiz/random";
import { quizDate } from "../src/lib/quiz/schedule";

type Embed = {
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string }>;
  footer?: { text: string };
};

function printEmbed(embed: Embed) {
  console.log(`\x1b[1m${embed.title}\x1b[0m`);
  console.log(embed.description ?? "");
  for (const field of embed.fields ?? []) {
    console.log(`${field.name}: ${field.value}`);
  }
  if (embed.footer) console.log(`\x1b[2m${embed.footer.text}\x1b[0m`);
}

function main() {
  const args = process.argv.slice(2);
  const dateFlag = args.indexOf("--date");
  const date = dateFlag !== -1 ? args[dateFlag + 1] : quizDate();
  const count = Number(args[0]) > 0 ? Number(args[0]) : 1;

  // Matches how the cron seeds itself, so `--date` reproduces that day exactly.
  const random =
    count === 1 ? createRandom(hashSeed(`quiz-${date}`)) : createRandom(Date.now() >>> 0);

  for (let i = 0; i < count; i += 1) {
    const { hand, solved, attempts } = generateQuizHand(random);

    console.log("\n" + "=".repeat(64));
    printEmbed(buildQuestionMessage("preview", hand, date).embeds[0]);

    console.log("\n" + "-".repeat(64));
    printEmbed(
      buildRevealMessage(hand, solved, { answers: 7, correct: 3 }, date).embeds[0] as Embed
    );

    console.log(
      `\n\x1b[2mgenerated in ${attempts} attempt(s) · ` +
        `${solved.han} han / ${solved.fu} fu / ${describeCorrectScore(solved)}\x1b[0m`
    );
  }
}

main();
