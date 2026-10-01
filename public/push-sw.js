// Reminder notifications, loaded into the app's service worker (see vite.config.ts).
// The server sends { title, body, tab }; tapping the notification opens that list.

self.addEventListener("push", (event) => {
  let n = { title: "Kitchen Stock", body: "", tab: "first" };
  try {
    if (event.data) n = { ...n, ...event.data.json() };
  } catch (e) {
    if (event.data) n.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(n.title, {
      body: n.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      tag: "kitchen-stock-" + n.tab,
      data: { tab: n.tab },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = "/?tab=" + encodeURIComponent((event.notification.data && event.notification.data.tab) || "first");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          if ("navigate" in w) w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
