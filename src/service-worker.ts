// @ts-nocheck -- service-worker globals require a dedicated worker tsconfig; runtime code remains TypeScript.
const CACHE_NAME = "gijutu-turi-ocean-v6-typescript";
const BASE_URL = new URL("./", self.registration.scope);
const PRECACHE_PATHS = [
  "",
  "index.html",
  "ocean-app.js",
  "ocean.css",
  "go-fish.html",
  "docker-whale.html",
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
  const isBuiltAsset = requestUrl.pathname.startsWith("/assets/") || requestUrl.pathname.startsWith("/chunks/");
  if (!PRECACHE_URLS.includes(cleanUrl) && !isBuiltAsset) return;

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
