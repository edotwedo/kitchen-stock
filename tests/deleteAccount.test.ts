import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// "Delete my account" (update 0006) on a real Postgres. Ann has a kitchen of her own and owns a
// shared one (Ben and Dan joined it, Ben first); Ben is also a plain member of Cal's kitchen.
const read = (f: string) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), "utf8");
const ANN = "00000000-0000-4000-8000-0000000000a1";
const BEN = "00000000-0000-4000-8000-0000000000b2";
const CAL = "00000000-0000-4000-8000-0000000000c3";
const DAN = "00000000-0000-4000-8000-0000000000d4";

let db: PGlite;
let solo: string, shared: string, cals: string;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}
const admin = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const fails = async (user: string | null, sql: string) => {
  try {
    await as(user, sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const members = async (h: string) => (await admin<{ user_id: string; role: string }>("select user_id, role from public.members where household_id = $1 order by user_id", [h])).rows;

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated;
    create role anon;
    create publication supabase_realtime;
  `);
  await db.exec(read("migrations/0001_households_and_items.sql"));
  await db.exec(read("catch-up.sql"));
  await db.exec(`
    grant usage on schema public, auth, extensions to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${ANN}', 'ann@example.com'), ('${BEN}', 'ben@example.com'), ('${CAL}', 'cal@example.com'), ('${DAN}', 'dan@example.com');
  `);
  const make = async (who: string, name: string) => (await as<{ id: string }>(who, "insert into public.households (name) values ($1) returning id", [name])).rows[0].id;
  solo = await make(ANN, "Ann's cabin");
  shared = await make(ANN, "Ann's house");
  cals = await make(CAL, "Cal's kitchen");
  await admin("insert into public.members (household_id, user_id, role, joined_at) values ($1, $2, 'member', now() + interval '1 day'), ($1, $3, 'member', now() + interval '2 days'), ($4, $2, 'member', now() + interval '1 day')", [shared, BEN, DAN, cals]);
  await as(ANN, "insert into public.items (household_id, id, name, loc) values ($1, 'milk', 'Milk', 'fridge'), ($2, 'rice', 'Rice', 'pantry')", [solo, shared]);
  await as(ANN, "insert into public.invites (household_id) values ($1)", [shared]);
}, 60_000);

describe("delete my account", () => {
  it("signed-out visitors can't call it", async () => {
    expect(await fails(null, "select public.delete_my_account()")).toMatch(/permission denied/);
  });

  it("Ann deletes her account", async () => {
    await as(ANN, "select public.delete_my_account()");
    expect((await admin("select 1 from auth.users where id = $1", [ANN])).rows).toHaveLength(0);
  });

  it("the kitchen only she used is gone, with its items", async () => {
    expect((await admin("select 1 from public.households where id = $1", [solo])).rows).toHaveLength(0);
    expect((await admin("select 1 from public.items where household_id = $1", [solo])).rows).toHaveLength(0);
  });

  it("the shared kitchen lives on, handed to Ben (who joined first), with its items", async () => {
    expect(await members(shared)).toEqual([
      { user_id: BEN, role: "owner" },
      { user_id: DAN, role: "member" },
    ]);
    expect((await admin<{ created_by: string | null }>("select created_by from public.households where id = $1", [shared])).rows[0].created_by).toBeNull();
    expect((await as(BEN, "select name from public.items where household_id = $1", [shared])).rows).toEqual([{ name: "Rice" }]);
    // Her edits stay, unsigned: no item may still point at the deleted sign-in.
    expect((await admin("select updated_by from public.items where household_id = $1", [shared])).rows).toEqual([{ updated_by: null }]);
    expect((await admin("select 1 from public.invites where household_id = $1", [shared])).rows).toHaveLength(0);
  });

  it("a plain member leaving doesn't change anyone else's role", async () => {
    await as(BEN, "select public.delete_my_account()");
    expect(await members(cals)).toEqual([{ user_id: CAL, role: "owner" }]);
    // Ben was the shared kitchen's owner; Dan is now its only person, so he inherits it.
    expect(await members(shared)).toEqual([{ user_id: DAN, role: "owner" }]);
  });
});
