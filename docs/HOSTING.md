# How Kitchen Stock is hosted

**Live:** https://kitchen-stock.phone-liaison.workers.dev (landing page at `/about.html`, privacy policy
at `/privacy.html`). **Cost: $0.** A domain name is optional and is the only thing that would cost money.

| Piece | Where | Notes |
| --- | --- | --- |
| The app (HTML, JavaScript, icons) | Cloudflare Workers static assets, free | Deployed from this computer with `npm run deploy` (not connected to GitHub) |
| Daily keep-alive | `worker/index.js`, a cron in `wrangler.jsonc` | One tiny read a day so the free Supabase project never pauses |
| Shared data and sign-in | Supabase, free plan | Project `ciaydggwsokkwphgtbfz` |
| Sign-in emails | Brevo, free plan, as Supabase's custom SMTP | Brevo key in Proton Pass; expires Oct 2027, or after 90 days unused |

The phone app (`kitchen-stock-app`) uses the same Supabase project, so web and phone share one kitchen.

## Deploying a new version

1. `npm test` (everything should pass).
2. `npm run deploy`. It builds the app, reads `.env.local` for the Supabase address and publishable key
   (both public; they ship inside the app), and runs `wrangler deploy`. The first time on a new computer,
   run `npx wrangler login` first.
3. Open the live address on a phone and check the change.

`.env.local` needs:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://ciaydggwsokkwphgtbfz.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_...` key (Supabase, Project Settings, API Keys) |
| `VITE_VAPID_PUBLIC_KEY` | only once web push reminders are set up (see `supabase/README.md`) |

`public/_headers` sets caching and security headers. Any address that isn't a file opens the app
(`not_found_handling` in `wrangler.jsonc`).

## Database updates

New database changes are numbered files in `supabase/migrations/`. To apply one: Supabase, **SQL
Editor**, new query, paste the file, **Run**; it should say "Success. No rows returned." Each file is safe to
run twice. `supabase/catch-up.sql` holds every update after 0001 in one file (made by `tools/catch-up.mjs`;
a test checks it's current).

| Update | What it adds | Applied to the live database |
| --- | --- | --- |
| 0002 to 0005 | sharing roles and handover, reminders, shelf spots, shopping notes | yes, Oct 2, 2026 |
| 0006 | Delete my account (required by the app stores) | **not yet** |

The app keeps working without a missing update and says which one is needed.

## Supabase settings that matter

- **Authentication, URL Configuration:** Site URL and Redirect URLs are the live address (keep
  `http://localhost:3000` in Redirect URLs for testing on this computer).
- **Authentication, Emails, SMTP Settings:** Brevo (custom SMTP on).
- **Authentication, Emails, Templates, Magic Link:** must include `{{ .Token }}` (the 6-digit code), which
  the phone app signs in with.
- **Free plan limits:** no automatic backups, and a pause after a week with no activity (the keep-alive
  covers that). Moving to Pro ($25 a month) makes sense once paying clients depend on it; Phil's call.

## Optional: a domain name (costs money, Phil's call)

Cloudflare sells domains at cost: a `.com` is about $10.44 a year (about $11.15 after the registry's
Nov 1, 2026 increase). If one is bought: add it under the Worker's **Domains & Routes**, update the two
Supabase URL settings, authenticate it in Brevo so sign-in emails don't land in spam, and update the
addresses in the phone app (`src/lib/sync.ts`, the invite message) and the organizer materials.
