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
