// Pantry Alchemist service worker: makes the app installable and usable offline.
// Pages: network first (fresh deploys win), cached copy when offline.
// Hashed build assets: cache first. Fonts: stale-while-revalidate. /api: never cached.
// World recipe library (TheMealDB): data stale-while-revalidate, photos cache-first (capped).
const VERSION = "pa-v2";
const LIBRARY = "pa-library-v1";
const PHOTOS = "pa-photos-v1";
const MAX_PHOTOS = 400;
const SHELL = ["/", "/app", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // Precache the JS/CSS those pages reference so the first offline launch works.
    for (const page of ["/", "/app"]) {
      const html = await (await cache.match(page))?.text();
      const assets = [...(html ?? "").matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll([...new Set(assets)]).catch(() => {});
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (![VERSION, LIBRARY, PHOTOS].includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return;

  if (url.hostname === "www.themealdb.com" && url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      const cache = await caches.open(LIBRARY);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      if (hit) {
        event.waitUntil(net.catch(() => {}));
        return hit;
      }
      return net;
    })());
    return;
  }

  if (url.hostname === "www.themealdb.com" && url.pathname.startsWith("/images/")) {
    event.respondWith((async () => {
      const cache = await caches.open(PHOTOS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") {
        await cache.put(req, res.clone());
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PHOTOS))) await cache.delete(old);
      }
      return res;
    })());
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const key = url.pathname.startsWith("/app") ? "/app" : url.pathname;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put(key, res.clone());
        return res;
      } catch {
        return (await caches.match(key)) ?? (await caches.match("/app")) ?? Response.error();
      }
    })());
    return;
  }

  if (url.origin === location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    })());
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit ?? net;
    })());
  }
});
