const CACHE = "mybuddy-v1";
const PRECACHE = ["/", "/manifest.json", "/api/icons/192", "/api/icons/512"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})));
});

self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const tasks = [
    self.registration.showNotification(data.title || "MyBuddy", {
      body: data.body || "",
      icon: "/api/icons/192",
      badge: "/api/icons/96",
      tag: data.tag || "mybuddy",
      data: { url: data.url || "/" },
    }),
  ];
  if (data.badge != null && "setAppBadge" in self.navigator) {
    tasks.push(self.navigator.setAppBadge(data.badge));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data?.url || "/");
    })
  );
});
