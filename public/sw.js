/* Service worker for Unified Prayers.
   Bump CACHE_VERSION whenever the shell needs to be re-fetched. */

const CACHE_VERSION = 'v3';
const CACHE = `unified-prayers-${CACHE_VERSION}`;

/* Enough to open the app and pray with no connection at all. Next's own
   JS/CSS lives under /_next/static/ with content hashes, so it is cached
   at runtime rather than listed here. */
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/dove.webp',
  '/mary.webp',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Added one at a time: addAll is all-or-nothing, and a single missing
    // asset should not stop the worker from installing.
    await Promise.all(PRECACHE.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('unified-prayers-') && k !== CACHE)
          .map(k => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const isFontHost = url =>
  url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

/* Hashed build output never changes under the same URL, so it is safe to
   serve from cache forever and fill in on first request. */
const isImmutable = url =>
  url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Vercel's analytics script and its beacons: always live, never stored. A
  // cached copy of a measurement script is the one thing it must not be.
  if (url.pathname.startsWith('/_vercel/')) return;

  // Navigations: network first so a deploy lands immediately, shell as fallback.
  if (req.mode === 'navigate') {
    // Keyed by path, so the manifest shortcuts (/?set=mary) do not each store
    // their own copy of the same page.
    const key = url.origin + url.pathname;
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        const res = preloaded || await fetch(req);
        const cache = await caches.open(CACHE);
        // Each page under its own URL. Storing every navigation under '/'
        // would mean one visit to /login leaves the sign-in form as the
        // offline shell, and praying offline would open it instead of the app.
        cache.put(key, res.clone());
        return res;
      } catch (err) {
        const cache = await caches.open(CACHE);
        // This page if it has been seen before, otherwise the app shell:
        // signing in needs the network anyway, and offline is for praying.
        return (await cache.match(key)) ||
               (await cache.match('/')) ||
               new Response('Offline', {
                 status: 503,
                 headers: { 'Content-Type': 'text/plain; charset=utf-8' },
               });
      }
    })());
    return;
  }

  if (isImmutable(url)) { event.respondWith(cacheFirst(req)); return; }
  if (isFontHost(url)) { event.respondWith(staleWhileRevalidate(req)); return; }
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
