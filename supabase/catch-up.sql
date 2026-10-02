-- Kitchen Stock: catch the database up in one step.
-- Contains updates 0002, 0003, 0004, 0005, in order. Safe to run more than once.
-- Paste it all into Supabase's SQL Editor and press Run; it should end with "Success. No rows returned."
-- Made by tools/catch-up.mjs from supabase/migrations/; don't edit by hand.

begin;

-- ===== 0002_members_and_handoff.sql =====
-- Kitchen Stock: see who's in a kitchen, invite someone as an owner, and change roles.
--
-- This is how an organizer hands a kitchen to a client: set it up, send an owner
-- invite, then stay on (for remote updates) or leave. A kitchen always keeps at
-- least one owner.

-- Invites can now make the person an owner instead of a member.
alter table public.invites add column if not exists role text not null default 'member'
  check (role in ('owner', 'member'));

-- Joining uses the invite's role. Someone already in the kitchen can be promoted by
-- an owner invite, never demoted by a member one.
create or replace function public.join_household(invite_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites
    where code = lower(trim(invite_code)) and used_by is null and expires_at > now()
    for update;
  if not found then raise exception 'That invite code is wrong, used, or expired'; end if;
  insert into public.members as m (household_id, user_id, role)
    values (inv.household_id, auth.uid(), inv.role)
    on conflict (household_id, user_id)
    do update set role = case when excluded.role = 'owner' then 'owner' else m.role end;
  update public.invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.household_id;
end;
$$;

-- Who's in a kitchen, with their sign-in email. Only members of that kitchen can ask.
create or replace function public.household_members(h uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.joined_at
  from public.members m
  join auth.users u on u.id = m.user_id
  where m.household_id = h and public.is_member(h)
  order by m.joined_at;
$$;

-- An owner makes someone an owner or a member. The last owner can't be demoted.
create or replace function public.set_member_role(h uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(h) then raise exception 'Only an owner can change roles'; end if;
  if new_role not in ('owner', 'member') then raise exception 'Unknown role'; end if;
  if new_role = 'member'
     and exists (select 1 from public.members where household_id = h and user_id = member and role = 'owner')
     and (select count(*) from public.members where household_id = h and role = 'owner') <= 1 then
    raise exception 'A kitchen needs at least one owner';
  end if;
  update public.members set role = new_role where household_id = h and user_id = member;
end;
$$;

-- Leave a kitchen (or, as an owner, remove someone). The last owner can't leave
-- while other people are still in it: hand it over first.
create or replace function public.leave_household(h uuid, member uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(member, auth.uid());
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if target <> auth.uid() and not public.is_owner(h) then raise exception 'Only an owner can remove people'; end if;
  if exists (select 1 from public.members where household_id = h and user_id = target and role = 'owner')
     and (select count(*) from public.members where household_id = h and role = 'owner') <= 1
     and (select count(*) from public.members where household_id = h) > 1 then
    raise exception 'A kitchen needs at least one owner';
  end if;
  delete from public.members where household_id = h and user_id = target;
end;
$$;

revoke execute on function public.household_members(uuid), public.set_member_role(uuid, uuid, text), public.leave_household(uuid, uuid) from public, anon;
grant execute on function public.household_members(uuid), public.set_member_role(uuid, uuid, text), public.leave_household(uuid, uuid) to authenticated;
revoke execute on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;

-- Leaving and removing now go through leave_household (which keeps an owner), not direct deletes.
drop policy if exists "owners remove members, anyone can leave" on public.members;


-- ===== 0003_reminders.sql =====
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

drop policy if exists "people see their own phones" on public.push_subscriptions;
create policy "people see their own phones" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "people add their own phones to their kitchens" on public.push_subscriptions;
create policy "people add their own phones to their kitchens" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid() and public.is_member(household_id));
drop policy if exists "people update their own phones" on public.push_subscriptions;
create policy "people update their own phones" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(household_id));
drop policy if exists "people remove their own phones" on public.push_subscriptions;
create policy "people remove their own phones" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());


-- ===== 0004_spots.sql =====
-- Kitchen Stock database update 0004: shelf spots.
-- Lets an item say where in its place it lives ("Door", "Top shelf", "Bin 2").
-- Safe to run more than once. Until it's run, the app saves everything except spots.

alter table public.items add column if not exists spot text
  check (spot is null or length(spot) <= 40);


-- ===== 0005_shopping_notes.sql =====
-- Kitchen Stock database update 0005: shopping notes.
-- Lets an item carry a note for the shopping list ("oat milk, not regular"), cleared on restock.
-- Safe to run more than once. Until it's run, the app saves everything except shopping notes.

alter table public.items add column if not exists buy text
  check (buy is null or length(buy) <= 80);

commit;
