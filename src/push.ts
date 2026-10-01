import { supabase } from "./cloud";

/**
 * Phone reminders: subscribe this phone to push notifications for the open kitchen.
 * Works once the app is hosted, database update 0003 is run, the send-reminders
 * function is deployed, and VITE_VAPID_PUBLIC_KEY is set (see supabase/README.md).
 */

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushConfigured = !!KEY && !!supabase;

export type PushSupport = "ok" | "install-first" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  // iPhones only allow notifications from an app added to the Home Screen.
  if (ios && !installed) return "install-first";
  if (!("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Is this phone already getting reminders? */
export async function pushEnabled(): Promise<boolean> {
  const reg = await registration();
  return !!(reg && (await reg.pushManager.getSubscription()));
}

export async function enablePush(kitchenId: string): Promise<string | null> {
  if (!pushConfigured || !supabase || !KEY) return "Reminders aren't set up for this app yet.";
  if (pushSupport() === "install-first") return "On iPhone, add Kitchen Stock to your Home Screen first, then turn reminders on from there.";
  if (pushSupport() !== "ok") return "This browser can't show reminders.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Notifications are blocked. Allow them for Kitchen Stock in your phone's settings, then try again.";
  const reg = await registration();
  if (!reg) return "The app isn't fully installed yet. Reload and try again.";
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: json.endpoint,
    household_id: kitchenId,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
  });
  if (error) return /could not find|does not exist/i.test(error.message) ? "Run database update 0003 in Supabase first." : "Couldn't turn reminders on. Try again.";
  return null;
}

export async function disablePush(): Promise<string | null> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return null;
  await supabase?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
  return null;
}
