// Service worker for signage TV player.
// Caches all media from the signage-media Supabase Storage bucket so files
// are downloaded once and served from local storage on every subsequent
// page load — eliminating CDN egress charges for media that has already been
// seen on this TV.
//
// Range requests (video seeking) are passed through to the network so
// the browser can handle partial-content responses natively.

const CACHE_NAME = "signage-media-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up any old cache versions from previous deployments.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Only intercept requests to the signage-media Supabase Storage bucket.
  if (!url.includes("/storage/v1/object/public/signage-media/")) return;

  // Pass Range requests through — video seeking uses partial content
  // and caching raw range responses would corrupt the cached entry.
  if (event.request.headers.get("range")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok) {
        // Clone before consuming — cache.put() and the caller both need it.
        cache.put(event.request, response.clone());
      }
      return response;
    })
  );
});
