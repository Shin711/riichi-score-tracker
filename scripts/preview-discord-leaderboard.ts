/**
 * Prints the Discord standings message for the live site's current leaderboard
 * without posting anything. Run: npx tsx scripts/preview-discord-leaderboard.ts
 */
import { buildLeaderboardWebhookPayload } from "../src/lib/discord/leaderboardMessage";

const SOURCE = "https://flushing-riichi-mahjong-club.vercel.app/api/leaderboard";

async function main() {
  const res = await fetch(SOURCE);
  const data = await res.json();

  const payload = buildLeaderboardWebhookPayload({
    entries: data.entries,
    period: data.period,
    minGamesForRank: data.minGamesForRank,
    useRating: data.useRating,
    gamesWithPlayers: data.gamesWithPlayers,
  });

  const embed = payload.embeds![0];
  console.log(`TITLE: ${embed.title}`);
  console.log(`URL:   ${embed.url}`);
  console.log(embed.description);
  for (const field of embed.fields ?? []) {
    console.log(`\n${field.name}\n${field.value}`);
  }
  console.log(`\nFOOTER: ${embed.footer?.text}`);
  console.log(`\n--- raw payload bytes: ${JSON.stringify(payload).length} ---`);
}

void main();
