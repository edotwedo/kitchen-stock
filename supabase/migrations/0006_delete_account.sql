-- Kitchen Stock database update 0006: delete my account.
-- The app stores (Google Play and Apple) require a way to delete your account from inside the app.
-- Safe to run more than once.
--
-- What deleting does, for each kitchen you're in:
--   - you're the only person in it: the whole kitchen goes (items, invites, reminders);
--   - other people share it and you're its only owner: the person who joined next-earliest
--     becomes the owner, so the kitchen always keeps one, then you're removed;
--   - otherwise you're just removed.
-- Then your sign-in (email) is deleted, which also removes your reminder settings and any
-- unused invites you made. Item changes you made stay in shared kitchens, unsigned.

-- A shared kitchen outlives the person who created it, so "created by" must be allowed to empty.
alter table public.households alter column created_by drop not null;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  m record;
  heir uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  for m in select household_id, role from public.members where user_id = me loop
    if not exists (select 1 from public.members where household_id = m.household_id and user_id <> me) then
      delete from public.households where id = m.household_id;
    else
      if m.role = 'owner' and not exists (
        select 1 from public.members where household_id = m.household_id and user_id <> me and role = 'owner'
      ) then
        select user_id into heir from public.members
          where household_id = m.household_id and user_id <> me
          order by joined_at, user_id limit 1;
        update public.members set role = 'owner' where household_id = m.household_id and user_id = heir;
      end if;
      delete from public.members where household_id = m.household_id and user_id = me;
    end if;
  end loop;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
