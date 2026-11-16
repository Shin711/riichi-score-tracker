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

/** Hour of day (0–23) in the club timezone. */
export function quizHour(date = new Date(), timeZone = QUIZ_TIMEZONE): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(hour) % 24;
}

/**
 * Whether a cron run asking for local hour `at` has landed on it.
 *
 * Vercel schedules in UTC, and Eastern is UTC−4 in summer but UTC−5 in winter,
 * so each quiz job is scheduled at *both* UTC hours that can be 10am (or 10pm)
 * Eastern. Exactly one of the pair lands on the wanted local hour on any given
 * day — including the days the clocks change — and the other skips.
 *
 * A request with no `at` (someone running the job by hand) always proceeds.
 */
export function isScheduledQuizHour(
  at: string | null,
  date = new Date(),
  timeZone = QUIZ_TIMEZONE
): boolean {
  if (at === null) return true;
  return Number(at) === quizHour(date, timeZone);
}
