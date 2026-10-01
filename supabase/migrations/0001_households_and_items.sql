-- Kitchen Stock: households, members, invites and items.
--
-- Every row belongs to a household, and row-level security only lets a signed-in
-- person see or change households they're a member of. Household settings (places,
-- dietary flags, people and their rules, freezer days) live in one JSON column
-- because they change rarely; items are rows so two phones can edit at once.

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables ----------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My kitchen',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.invites (
  code text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  household_id uuid not null references public.households on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users on delete set null,
  used_at timestamptz
);

create table public.items (
  household_id uuid not null references public.households on delete cascade,
  id text not null,
  name text not null check (length(trim(name)) > 0),
  loc text not null,
  qty text not null default '',
  level text not null default 'full' check (level in ('full', 'half', 'low', 'out')),
  use_by date,
  remind_on date,
  frozen_on date,
  wrap text not null default 'regular' check (wrap in ('regular', 'vacuum', 'chamber')),
  note text not null default '',
  flags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users on delete set null,
  primary key (household_id, id)
);

-- ---------- membership helper ----------

-- Security definer so policies can check membership without recursing into
-- the members table's own policies.
create function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.household_id = h and m.user_id = auth.uid());
$$;

create function public.is_owner(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.household_id = h and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- Whoever creates a household becomes its owner.
create function public.add_creator_as_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (household_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end;
$$;
create trigger households_owner after insert on public.households
  for each row execute function public.add_creator_as_owner();

-- Keep updated_at / updated_by honest no matter what the app sends.
create function public.stamp_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'items' then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;
create trigger items_stamp before insert or update on public.items
  for each row execute function public.stamp_update();
create trigger households_stamp before update on public.households
  for each row execute function public.stamp_update();

-- Join a household with an invite code. Codes work once and expire after a week.
create function public.join_household(invite_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites
    where code = lower(trim(invite_code)) and used_by is null and expires_at > now()
    for update;
  if not found then raise exception 'That invite code is wrong, used, or expired'; end if;
  insert into public.members (household_id, user_id) values (inv.household_id, auth.uid())
    on conflict do nothing;
  update public.invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.household_id;
end;
$$;

-- ---------- row-level security ----------

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.items enable row level security;

-- The creator can read it straight away too, so "create and return the new row" works
-- before the owner membership (added by trigger) is visible.
create policy "members read their households" on public.households
  for select to authenticated using (public.is_member(id) or created_by = auth.uid());
create policy "signed-in people create households" on public.households
  for insert to authenticated with check (created_by = auth.uid());
create policy "members update their households" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));
create policy "owners delete households" on public.households
  for delete to authenticated using (public.is_owner(id));

create policy "members see who else is in the household" on public.members
  for select to authenticated using (public.is_member(household_id));
create policy "owners remove members, anyone can leave" on public.members
  for delete to authenticated using (public.is_owner(household_id) or user_id = auth.uid());

create policy "owners see invites" on public.invites
  for select to authenticated using (public.is_owner(household_id));
create policy "owners create invites" on public.invites
  for insert to authenticated with check (public.is_owner(household_id) and created_by = auth.uid());
create policy "owners cancel invites" on public.invites
  for delete to authenticated using (public.is_owner(household_id));

create policy "members read items" on public.items
  for select to authenticated using (public.is_member(household_id));
create policy "members add items" on public.items
  for insert to authenticated with check (public.is_member(household_id));
create policy "members change items" on public.items
  for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "members delete items" on public.items
  for delete to authenticated using (public.is_member(household_id));

-- Only signed-in users can call the helpers.
revoke execute on function public.is_member(uuid), public.is_owner(uuid), public.join_household(text) from public, anon;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.join_household(text) to authenticated;

-- ---------- live sync ----------

alter publication supabase_realtime add table public.items, public.households;
