import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), "utf8");

// The pieces of Supabase that the migrations lean on, so they run on a plain Postgres.
const SUPABASE_STUB = `
  create schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated;
  create role anon;
  create publication supabase_realtime;
`;

describe("database updates", () => {
  it("catch-up.sql is up to date with the migrations folder", () => {
    const before = read("catch-up.sql");
    execFileSync(process.execPath, [new URL("../tools/catch-up.mjs", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")]);
    const lf = (s: string) => s.replace(/\r\n/g, "\n");
    expect(lf(read("catch-up.sql"))).toBe(lf(before));
  });

  it("0001 then the catch-up file runs cleanly, and runs again with no errors", { timeout: 60_000 }, async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUB);
    await db.exec(read("migrations/0001_households_and_items.sql"));
    await db.exec(read("catch-up.sql"));
    await db.exec(read("catch-up.sql")); // safe to run twice

    const cols = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'items'");
    expect(cols.rows.map((r) => r.column_name)).toEqual(expect.arrayContaining(["spot", "buy"]));
    const fns = await db.query<{ proname: string }>("select proname from pg_proc where pronamespace = 'public'::regnamespace");
    expect(fns.rows.map((r) => r.proname)).toEqual(expect.arrayContaining(["household_members", "set_member_role", "leave_household", "join_household"]));
    const tables = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    expect(tables.rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(["push_subscriptions"]));
    const pol = await db.query<{ n: number }>("select count(*)::int as n from pg_policies where tablename = 'push_subscriptions'");
    expect(pol.rows[0].n).toBe(4);
    await db.close();
  });
});
