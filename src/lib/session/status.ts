export function isSessionEnded(endedAt: string | null | undefined): boolean {
  return Boolean(endedAt);
}

export const SESSION_ENDED_MESSAGE =
  "This game has ended. Reopen it from the session page to make changes.";
