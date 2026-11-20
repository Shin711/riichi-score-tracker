-- Winning hands for games whose log we could read, in entries_json seat order.
-- Null means unknown (a manual score entry, or a Mahjong Soul game not backfilled yet).
-- An empty array means the log was read and nobody won a hand.

alter table public.imported_games
  add column if not exists hand_results_json jsonb;

comment on column public.imported_games.hand_results_json is
  'Winning hands as { winnerSeat, dealInSeat, points }[]. dealInSeat null is a tsumo. Seat indexes match entries_json. Null if the log was never read.';
