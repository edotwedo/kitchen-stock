-- Kitchen Stock: phone reminders.
--
-- Each phone that turns reminders on stores its push subscription here, for one
-- kitchen. The send-reminders function (supabase/functions) runs every hour, sends
-- the morning notice at 8am and the shopping list at 9am Saturday in the phone's own
-- time zone, and records the date so nothing is sent twice.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  p256dh text not null,
  auth text not null,
  time_zone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now(),
  last_morning date,
  last_shopping date
);
create index if not exists push_subscriptions_household_idx on public.push_subscriptions (household_id);

alter table public.push_subscriptions enable row level security;

create policy "people see their own phones" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "people add their own phones to their kitchens" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(household_id));
create policy "people update their own phones" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(household_id));
create policy "people remove their own phones" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
