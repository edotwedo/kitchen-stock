// Build and deploy Kitchen Stock to Cloudflare: `npm run deploy`.
// Passes the Supabase address and publishable key (both already public in the app itself)
// to the daily keep-alive, read from .env.local so they never sit in the repository.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error(".env.local needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");

execSync("npm run build", { stdio: "inherit" });
execSync(`npx wrangler deploy --var SUPABASE_URL:${url} --var SUPABASE_KEY:${key}`, { stdio: ["inherit", "inherit", "inherit"] });
