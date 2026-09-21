const CACHE_NAME = "gijutu-turi-ocean-v4-fishing";
const BASE_URL = new URL("./", self.registration.scope);
const PRECACHE_PATHS = [
  "",
  "index.html",
  "ocean-app.js",
  "ocean.css",
  "ocean-scene.js",
  "go-fish.js",
  "vendor/three.module.js",
  "vendor/three.core.js",
  "manifest.webmanifest",
  "assets/gijutu-turi-logo.png",
];
const PRECACHE_URLS = PRECACHE_PATHS.map((path) => new URL(path, BASE_URL).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("gijutu-turi-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith("/api/") || requestUrl.pathname.endsWith("/ocean-ws")) return;
  const cleanUrl = new URL(requestUrl.pathname, self.location.origin).toString();
  if (!PRECACHE_URLS.includes(cleanUrl)) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.status === 200) {
        const responseClone = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(cleanUrl, responseClone)));
      }
      return response;
    }).catch(async () => (await caches.match(cleanUrl)) ?? Response.error()),
  );
});
