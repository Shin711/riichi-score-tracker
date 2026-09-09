/** Quiz days follow the club's timezone so "today's hand" means the same thing to everyone. */

import { LEADERBOARD_TIMEZONE } from "@/lib/leaderboard/timezone";

export const QUIZ_TIMEZONE = LEADERBOARD_TIMEZONE;

/** Calendar date in the club timezone, as `YYYY-MM-DD`. */
export function quizDate(date = new Date(), timeZone = QUIZ_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** e.g. "Wednesday, September 9". */
export function quizDateLabel(isoDate: string, timeZone = QUIZ_TIMEZONE): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return utcNoon.toLocaleDateString("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
