-- Kitchen Stock database update 0004: shelf spots.
-- Lets an item say where in its place it lives ("Door", "Top shelf", "Bin 2").
-- Safe to run more than once. Until it's run, the app saves everything except spots.

alter table public.items add column if not exists spot text
  check (spot is null or length(spot) <= 40);
