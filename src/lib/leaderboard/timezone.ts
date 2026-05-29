/** Leaderboard months follow US Eastern (handles EST/EDT automatically). */
export const LEADERBOARD_TIMEZONE = "America/New_York";

function readDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Calendar year/month (1–12) in the leaderboard timezone. */
export function getMonthPartsInTimezone(
  date = new Date(),
  timeZone = LEADERBOARD_TIMEZONE
) {
  const { year, month } = readDateParts(date, timeZone);
  return { year, month };
}

export function formatMonthLabel(
  year: number,
  month: number,
  timeZone = LEADERBOARD_TIMEZONE
) {
  const utcNoon = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  return utcNoon.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone,
  });
}

/**
 * UTC instants for [start, end) of a calendar month in the given timezone.
 * e.g. April 2026 Eastern = 2026-04-01 04:00 UTC → 2026-05-01 04:00 UTC (EDT).
 */
export function getMonthPeriodBounds(
  year: number,
  month: number,
  timeZone = LEADERBOARD_TIMEZONE
) {
  let endYear = year;
  let endMonth = month + 1;
  if (endMonth > 12) {
    endMonth = 1;
    endYear += 1;
  }

  return {
    startIso: localMidnightToUtcIso(year, month, 1, timeZone),
    endIso: localMidnightToUtcIso(endYear, endMonth, 1, timeZone),
  };
}

function localMidnightToUtcIso(
  year: number,
  month: number,
  day: number,
  timeZone: string
) {
  const desiredLocalMs = Date.UTC(year, month - 1, day, 0, 0, 0);

  // Initial guess: Eastern is typically UTC−4 or UTC−5
  let utcMs = desiredLocalMs + 5 * 60 * 60 * 1000;

  for (let i = 0; i < 4; i += 1) {
    const parts = readDateParts(new Date(utcMs), timeZone);
    const actualLocalMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    utcMs += desiredLocalMs - actualLocalMs;
  }

  return new Date(utcMs).toISOString();
}

export function formatTimezoneLabel(timeZone = LEADERBOARD_TIMEZONE) {
  const sample = new Date(Date.UTC(2026, 6, 1, 12, 0, 0));
  const short = sample.toLocaleString("en-US", { timeZone, timeZoneName: "short" }).split(" ").pop();
  return short ?? "ET";
}
