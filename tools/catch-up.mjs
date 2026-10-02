// Builds supabase/catch-up.sql: every database update after 0001, in order, in one file that is
// safe to paste and run more than once (policies are dropped before they're re-created).
//   node tools/catch-up.mjs
import fs from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.startsWith("0001")).sort();

const repeatable = (sql) =>
  sql.replace(/^create policy "([^"]+)" on ([\w.]+)/gm, (m, name, table) => `drop policy if exists "${name}" on ${table};\n${m}`);

const out = [
  "-- Kitchen Stock: catch the database up in one step.",
  `-- Contains updates ${files.map((f) => f.slice(0, 4)).join(", ")}, in order. Safe to run more than once.`,
  "-- Paste it all into Supabase's SQL Editor and press Run; it should end with \"Success. No rows returned.\"",
  "-- Made by tools/catch-up.mjs from supabase/migrations/; don't edit by hand.",
  "",
  "begin;",
  ...files.map((f) => `\n-- ===== ${f} =====\n${repeatable(fs.readFileSync(new URL(f, dir), "utf8")).trim()}\n`),
  "commit;",
  "",
].join("\n");

fs.writeFileSync(new URL("../supabase/catch-up.sql", import.meta.url), out);
console.log(`wrote supabase/catch-up.sql from ${files.join(", ")}`);
