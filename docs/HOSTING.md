# Putting Kitchen Stock online (Cloudflare Pages)

About 10 minutes once there's a Cloudflare account. **Free**: Cloudflare Pages costs nothing for a site
like this, and "on both free and paid plans, requests to static assets are free and unlimited"
([Cloudflare](https://developers.cloudflare.com/pages/functions/pricing/)). A domain name is optional
and is the only thing that would cost money.

The app is a static site (HTML, JavaScript, icons). The shared data lives in Supabase, which is already
set up, so Cloudflare only serves the files.

## 1. Connect the repo (5 minutes)

1. In the Cloudflare dashboard: **Workers & Pages** > **Create** > **Pages** > **Connect to Git**.
2. Pick GitHub, allow Cloudflare to see the `kitchen-stock` repo, and choose it.
3. Build settings ([Cloudflare's Vite settings](https://developers.cloudflare.com/pages/configuration/build-configuration/)):

   | Setting | Value |
   | --- | --- |
   | Framework preset | Vite (or None) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Production branch | `main` |

4. **Environment variables** (same values as `.env.local` on this computer):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://ciaydggwsokkwphgtbfz.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_...` key (it's meant to be public; it ships inside the app) |
   | `VITE_VAPID_PUBLIC_KEY` | leave out until reminders are set up |

   The build image uses Node 22.16 by default, and the build tools need 22.12 or newer, so it works as is.
   Set `NODE_VERSION` only if a build ever complains about Node ([build image](https://developers.cloudflare.com/pages/configuration/build-image/)).

5. **Save and Deploy.** The site appears at `https://kitchen-stock.pages.dev` (or a similar name if
   that one's taken). Every push to `main` redeploys on its own. The free plan allows 500 builds a month
   ([limits](https://developers.cloudflare.com/pages/platform/limits/)).

`public/_headers` is already in the repo, so the app's caching and security headers apply with no extra
setup. Unknown paths fall back to the app automatically, and the landing page is at `/about.html`.

## 2. Tell Supabase about the new address (2 minutes)

Sign-in links only go to addresses Supabase knows. In Supabase: **Authentication** > **URL Configuration**:

- **Site URL**: the new address, e.g. `https://kitchen-stock.pages.dev`
- **Redirect URLs**: add the same address, and keep `http://localhost:3000` for testing on this computer.

## 3. Check it (3 minutes)

- Open `https://<your-address>/about.html` on a phone and tap **Try the sample kitchen**.
- Sign in with your email, open your kitchen, and add it to the home screen (steps are on the landing page).
- Turn on airplane mode and reopen it: the list should still be there.

## Optional: a domain name (costs money, your call)

- Cloudflare sells domains at cost: a `.com` is about **$10.44 a year**, with the same price at renewal.
  The registry raises its fee on Nov 1, 2026, which takes it to about **$11.15**
  ([source](https://startupowl.com/reviews/cloudflare-registrar)). Other endings cost different amounts;
  the dashboard shows the price before you buy.
- Not needed to start: `pages.dev` works on every phone and supports install and offline.
- If you buy one later: **Custom domains** in the Pages project, then update the two Supabase URL
  settings above.

## Still needed for other people to sign in

Supabase's built-in email only reaches members of your Supabase team. Before clients can sign in, connect
a sending service (Brevo has a free tier) under **Authentication** > **Emails** > **SMTP Settings**; see
`supabase/README.md`. Until then, the sample kitchen works for anyone with no sign-in.

## Phone Liaison is different

Phone Liaison runs its own small server (it saves requests and has an owner dashboard), so it can't go on
Pages as-is. It needs a host that runs Node, or a rewrite of its few server routes as Cloudflare Functions.
That's a separate step for later.
