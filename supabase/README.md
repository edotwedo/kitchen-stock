# Database and server setup

Everything here is run once, in order. The SQL files are pasted into the Supabase dashboard's **SQL Editor** and run with **Run**; each should end with "Success. No rows returned."

| File | What it adds |
| --- | --- |
| `migrations/0001_households_and_items.sql` | Households, members, invites, items, row-level security, live sync |
| `migrations/0002_members_and_handoff.sql` | Seeing who's in a kitchen, owner invites, roles, leaving (handing a kitchen to a client) |
| `migrations/0003_reminders.sql` | Phones that have turned reminders on |
| `migrations/0004_spots.sql` | Shelf spots ("Door", "Top shelf") on items |

## Sign-in emails

Supabase's sign-in email sends a link by default; the app uses the 6-digit code instead. In **Authentication → Emails → Templates**, add this line to both **Magic Link** and **Confirm signup**:

```html
<h2>{{ .Token }}</h2>
```

The built-in email sender only delivers to members of your Supabase team. To let anyone sign in (family, clients), connect a sending service under **Authentication → Emails → SMTP Settings**.

## Phone reminders

Reminders need the app to be online (hosted) first, because phones only accept notifications from a real web address.

1. **Run** `migrations/0003_reminders.sql`.
2. **Make a key pair** for notifications, on this computer:
   ```
   npx web-push generate-vapid-keys
   ```
   It prints a public key and a private key. The public key goes in the app's settings (`VITE_VAPID_PUBLIC_KEY` in `.env.local` and in the hosting settings). The private key is a secret: it only goes into Supabase in the next step. Keep a copy in Proton Pass.
3. **Install the Supabase command line and log in** (opens the browser):
   ```
   npx supabase login
   npx supabase link --project-ref ciaydggwsokkwphgtbfz
   ```
4. **Set the function's secrets.** Make up a long random `CRON_SECRET` (Proton Pass can generate one) and use your contact email:
   ```
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_CONTACT=you@example.com CRON_SECRET=...
   ```
5. **Deploy the function.** It checks its own secret header, so Supabase's sign-in check is turned off for it:
   ```
   npx supabase functions deploy send-reminders --no-verify-jwt
   ```
6. **Run it every hour.** In the SQL Editor, with your `CRON_SECRET` filled in:
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule(
     'send-reminders',
     '5 * * * *',
     $$ select net.http_post(
          url := 'https://ciaydggwsokkwphgtbfz.supabase.co/functions/v1/send-reminders',
          headers := jsonb_build_object('x-cron-secret', 'PASTE-CRON-SECRET-HERE', 'Content-Type', 'application/json'),
          body := '{}'::jsonb
        ) $$
   );
   ```
7. **Turn reminders on** in the app: Settings → Reminders. On iPhone, add the app to the Home Screen first and do it from there.

The function sends the morning notice at 8am and the shopping list at 9am Saturday in each phone's own time zone. What they say comes from `functions/_shared/reminders.ts`, which the app's tests check against real data.
