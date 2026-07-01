self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const tasks = [];

  tasks.push(
    self.registration.showNotification(data.title || "MyBuddy", {
      body: data.body || "",
      icon: "/api/icons/192",
      badge: "/api/icons/96",
      tag: data.tag || "mybuddy",
      data: { url: data.url || "/" },
    })
  );

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

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
