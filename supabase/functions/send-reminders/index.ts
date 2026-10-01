// Sends Kitchen Stock reminders. Runs every hour (see supabase/README.md for the schedule).
// At 8am in each phone's time zone it sends the morning notice; at 9am on Saturday,
// the shopping list. last_morning / last_shopping make a second run in the same hour harmless.
//
// Secrets (set with `supabase secrets set`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_CONTACT (an email address), CRON_SECRET. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { localClock, localDate, morningNotice, shoppingNotice, type Notice, type ReminderItem, type ReminderKitchen } from "../_shared/reminders.ts";

const MORNING_HOUR = 8;
const SHOPPING = { weekday: 6, hour: 9 }; // Saturday 9am

interface Sub {
  endpoint: string;
  household_id: string;
  p256dh: string;
  auth: string;
  time_zone: string;
  last_morning: string | null;
  last_shopping: string | null;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("Not allowed", { status: 401 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(`mailto:${Deno.env.get("VAPID_CONTACT")}`, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  const { data: subs, error } = await db.from("push_subscriptions").select("*");
  if (error) return new Response(error.message, { status: 500 });

  const now = new Date();
  const kitchens = new Map<string, { k: ReminderKitchen; items: ReminderItem[] } | null>();
  async function kitchen(id: string) {
    if (!kitchens.has(id)) {
      const [hh, items] = await Promise.all([
        db.from("households").select("name, settings").eq("id", id).single(),
        db.from("items").select("name, loc, level, use_by, remind_on, frozen_on, wrap").eq("household_id", id).range(0, 4999),
      ]);
      kitchens.set(id, hh.error || items.error ? null : { k: hh.data as ReminderKitchen, items: items.data as ReminderItem[] });
    }
    return kitchens.get(id) ?? null;
  }

  let sent = 0;
  for (const s of (subs ?? []) as Sub[]) {
    let tz = s.time_zone;
    try {
      localClock(now, tz);
    } catch {
      tz = "America/Los_Angeles";
    }
    const { hour, weekday } = localClock(now, tz);
    const today = localDate(now, tz);
    const morning = hour === MORNING_HOUR && s.last_morning !== today;
    const shopping = weekday === SHOPPING.weekday && hour === SHOPPING.hour && s.last_shopping !== today;
    if (!morning && !shopping) continue;

    const data = await kitchen(s.household_id);
    if (!data) continue;
    const notice: Notice | null = morning ? morningNotice(data.k, data.items, today) : shoppingNotice(data.k, data.items);
    const stamp = morning ? { last_morning: today } : { last_shopping: today };

    if (notice) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(notice), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The phone unsubscribed or the app was removed: forget it.
        if (code === 404 || code === 410) {
          await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          continue;
        }
        console.error("push failed", code, (e as Error).message);
        continue; // try again next hour
      }
    }
    await db.from("push_subscriptions").update(stamp).eq("endpoint", s.endpoint);
  }
  return Response.json({ checked: subs?.length ?? 0, sent });
});
