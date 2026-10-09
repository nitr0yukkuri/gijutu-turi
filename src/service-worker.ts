// @ts-nocheck -- service-worker globals require a dedicated worker tsconfig; runtime code remains TypeScript.

const CACHE_NAME = "gijutu-turi-ocean-v12-assets";
const BASE_URL = new URL("./", self.registration.scope);
const PRECACHE_PATHS = [
  "",
  "index.html",
  "gofish",
  "dockerwhale",
  "docker",
  "cssfish",
  "k8sfish",
  "rustfish",
  "jseel",
  "complete",
  "ocean-app.js",
  "ocean.css",
  "manifest.webmanifest",
  "favicon.svg",
  "assets/gijutu-turi-logo.png",
  "assets/gijutu-turi-favicon-generated.png",
  "assets/gijutu-turi-og.png",
];
const PRECACHE_URLS = PRECACHE_PATHS.map((path) => new URL(path, BASE_URL).toString());

const isSafePrecachePath = (path) => {
  if (typeof path !== "string") return false;
  const segments = path.replaceAll("\\", "/").split("/");
  return (segments[0] === "assets" || segments[0] === "chunks")
    && segments.length > 1
    && segments.slice(1).every(segment => segment.length > 0 && segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/.test(segment))
    && /\.(?:js|css)$/.test(segments.at(-1) ?? "");
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(new URL("precache-manifest.json", BASE_URL), { cache: "no-store" })
      .then(response => response.ok ? response.json() : [])
      .catch(() => [])
      .then((manifest) => {
        const builtPaths = Array.isArray(manifest)
          ? manifest.filter(isSafePrecachePath)
          : [];
        const urls = [...PRECACHE_URLS, ...builtPaths.map(path => new URL(path, BASE_URL).toString())];
        return caches.open(CACHE_NAME).then(cache => cache.addAll(urls));
      })
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
