import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// The sharing rules (row-level security) checked on a real Postgres, playing three people:
// Ann owns a kitchen, Ben is a stranger who later joins with an invite, Cal is a stranger who never does.
const read = (f: string) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), "utf8");
const ANN = "00000000-0000-4000-8000-0000000000a1";
const BEN = "00000000-0000-4000-8000-0000000000b2";
const CAL = "00000000-0000-4000-8000-0000000000c3";

let db: PGlite;
let kitchen: string;

/** Run SQL as a signed-in person (Supabase's "authenticated" role with their user id), then go back to admin. */
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}
const fails = async (user: string | null, sql: string, params: unknown[] = []) => {
  try {
    await as(user, sql, params);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

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
  // What Supabase grants by default; the row-level rules decide what each person actually sees.
  await db.exec(`
    grant usage on schema public, auth, extensions to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${ANN}', 'ann@example.com'), ('${BEN}', 'ben@example.com'), ('${CAL}', 'cal@example.com');
  `);
  kitchen = (await as<{ id: string }>(ANN, "insert into public.households (name) values ('Ann''s kitchen') returning id")).rows[0].id;
  await as(ANN, "insert into public.items (household_id, id, name, loc) values ($1, 'milk', 'Milk', 'fridge')", [kitchen]);
}, 60_000);

describe("sharing rules", () => {
  it("the creator becomes the owner and sees their kitchen", async () => {
    const m = await as<{ role: string }>(ANN, "select role from public.members where household_id = $1 and user_id = $2", [kitchen, ANN]);
    expect(m.rows).toEqual([{ role: "owner" }]);
    expect((await as(ANN, "select id from public.items")).rows).toHaveLength(1);
  });

  it("a stranger can't see, change, add to or delete from someone else's kitchen", async () => {
    expect((await as(CAL, "select * from public.households")).rows).toHaveLength(0);
    expect((await as(CAL, "select * from public.items")).rows).toHaveLength(0);
    expect((await as(CAL, "update public.items set level = 'out' where id = 'milk' returning id")).rows).toHaveLength(0);
    expect((await as(CAL, "delete from public.items where id = 'milk' returning id")).rows).toHaveLength(0);
    expect(await fails(CAL, "insert into public.items (household_id, id, name, loc) values ($1, 'x', 'Sneaky', 'fridge')", [kitchen])).toMatch(/row-level security/);
    expect((await as(ANN, "select level from public.items where id = 'milk'")).rows).toEqual([{ level: "full" }]);
  });

  it("someone not signed in sees nothing and can't call the helpers", async () => {
    expect((await as(null, "select * from public.items")).rows).toHaveLength(0);
    expect(await fails(null, "select public.join_household('abc')")).toMatch(/permission denied/);
  });

  it("only the owner can make invites; a stranger can't make one for themselves", async () => {
    expect(await fails(CAL, "insert into public.invites (household_id) values ($1)", [kitchen])).toMatch(/row-level security/);
    const code = (await as<{ code: string }>(ANN, "insert into public.invites (household_id) values ($1) returning code", [kitchen])).rows[0].code;
    expect(code).toMatch(/^[0-9a-f]{12}$/);
    expect((await as(CAL, "select * from public.invites")).rows).toHaveLength(0);

    // Ben joins with the code and can now see and change the list.
    expect((await as<{ h: string }>(BEN, "select public.join_household($1) as h", [code])).rows[0].h).toBe(kitchen);
    expect((await as(BEN, "update public.items set level = 'low' where id = 'milk' returning id")).rows).toHaveLength(1);
    // The change is stamped with who really made it, whatever the app sends.
    expect((await as<{ updated_by: string }>(ANN, "select updated_by from public.items where id = 'milk'")).rows[0].updated_by).toBe(BEN);

    // A code works once.
    expect(await fails(CAL, "select public.join_household($1)", [code])).toMatch(/wrong, used, or expired/);
    expect((await as(CAL, "select * from public.items")).rows).toHaveLength(0);
  });

  it("a member can't make invites, change roles or remove the owner; they can leave", async () => {
    expect(await fails(BEN, "insert into public.invites (household_id) values ($1)", [kitchen])).toMatch(/row-level security/);
    expect(await fails(BEN, "select public.set_member_role($1, $2, 'member')", [kitchen, ANN])).toMatch(/Only an owner/);
    expect(await fails(BEN, "select public.leave_household($1, $2)", [kitchen, ANN])).toMatch(/Only an owner can remove/);
    expect((await as(BEN, "delete from public.members where user_id = $1 returning user_id", [ANN])).rows).toHaveLength(0);
    const people = await as<{ email: string }>(BEN, "select email from public.household_members($1)", [kitchen]);
    expect(people.rows.map((r) => r.email).sort()).toEqual(["ann@example.com", "ben@example.com"]);
    expect((await as(CAL, "select * from public.household_members($1)", [kitchen])).rows).toHaveLength(0);
  });

  it("phone reminders: people only register, see and change their own phones, for kitchens they're in", async () => {
    const phone = (endpoint: string, user: string) =>
      as(user, "insert into public.push_subscriptions (endpoint, household_id, p256dh, auth) values ($1, $2, 'key', 'secret')", [endpoint, kitchen]);
    await phone("https://push.example/ann-phone", ANN);
    await phone("https://push.example/ben-phone", BEN);
    // A stranger can't sign a phone up for someone else's kitchen, or pretend to be someone else.
    expect(await fails(CAL, "insert into public.push_subscriptions (endpoint, household_id, p256dh, auth) values ('https://push.example/cal', $1, 'k', 's')", [kitchen])).toMatch(/row-level security/);
    expect(await fails(BEN, "insert into public.push_subscriptions (endpoint, user_id, household_id, p256dh, auth) values ('https://push.example/fake', $1, $2, 'k', 's')", [ANN, kitchen])).toMatch(/row-level security/);
    // Everyone sees only their own phones, even in the same kitchen.
    expect((await as<{ endpoint: string }>(BEN, "select endpoint from public.push_subscriptions")).rows).toEqual([{ endpoint: "https://push.example/ben-phone" }]);
    expect((await as(CAL, "select * from public.push_subscriptions")).rows).toHaveLength(0);
    expect((await as(BEN, "update public.push_subscriptions set time_zone = 'UTC' where endpoint = 'https://push.example/ann-phone' returning endpoint")).rows).toHaveLength(0);
    expect((await as(BEN, "delete from public.push_subscriptions where endpoint = 'https://push.example/ann-phone' returning endpoint")).rows).toHaveLength(0);
    expect((await as(ANN, "select endpoint from public.push_subscriptions")).rows).toHaveLength(1);
    // And can't move their phone into a kitchen they're not in.
    const other = (await as<{ id: string }>(CAL, "insert into public.households (name) values ('Cal''s') returning id")).rows[0].id;
    expect(await fails(BEN, "update public.push_subscriptions set household_id = $1 where endpoint = 'https://push.example/ben-phone'", [other])).toMatch(/row-level security/);
  });

  it("handing a kitchen over: the owner promotes, can't leave while the only owner, then can", async () => {
    expect(await fails(ANN, "select public.leave_household($1)", [kitchen])).toMatch(/at least one owner/);
    await as(ANN, "select public.set_member_role($1, $2, 'owner')", [kitchen, BEN]);
    await as(ANN, "select public.leave_household($1)", [kitchen]);
    expect((await as(ANN, "select * from public.items")).rows).toHaveLength(0);
    expect((await as(BEN, "select * from public.items")).rows).toHaveLength(1);
    expect(await fails(BEN, "select public.set_member_role($1, $2, 'member')", [kitchen, BEN])).toMatch(/at least one owner/);
  });
});
