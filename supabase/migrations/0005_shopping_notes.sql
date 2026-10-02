-- Kitchen Stock database update 0005: shopping notes.
-- Lets an item carry a note for the shopping list ("oat milk, not regular"), cleared on restock.
-- Safe to run more than once. Until it's run, the app saves everything except shopping notes.

alter table public.items add column if not exists buy text
  check (buy is null or length(buy) <= 80);
