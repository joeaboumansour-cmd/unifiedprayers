/* Service worker for Unified Prayers.
   Bump CACHE_VERSION whenever the shell needs to be re-fetched. */

const CACHE_VERSION = 'v4';
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
  if (event.data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  // The page tells the worker things the worker cannot look up for itself.
  if (event.data && event.data.type === 'PUSH_CONFIG') {
    event.waitUntil(writeConfig(event.data.config || {}));
  }
});

/* ------------------------------------------------------------------ push --

   A worker has no localStorage, so the two things it needs at push time --
   which language to show the notification in, and the VAPID key to re-subscribe
   with -- have to be handed to it while the page is open and kept somewhere it
   can read when the page is long gone. That somewhere is the cache: it is the
   only storage this file already depends on, it survives restarts, and it is
   readable from the push event without a database handle.

   IndexedDB would work too and would be the obvious choice for anything larger.
   This is two strings. */

const CONFIG_URL = '/__push-config';
/* Deliberately not `unified-prayers-*`: activate() deletes every cache with
   that prefix except the current one, and this must outlive a version bump.
   Losing it would mean a push arriving before the next page load falls back to
   Arabic, and pushsubscriptionchange having no key to re-subscribe with. */
const CONFIG_CACHE = 'up-push-config';

async function writeConfig(patch) {
  const cache = await caches.open(CONFIG_CACHE);
  const current = await readConfig();
  const next = { ...current, ...patch };
  await cache.put(
    CONFIG_URL,
    new Response(JSON.stringify(next), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

async function readConfig() {
  try {
    const cache = await caches.open(CONFIG_CACHE);
    const hit = await cache.match(CONFIG_URL);
    return hit ? await hit.json() : {};
  } catch (err) {
    return {};
  }
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (err) {
      /* Not our payload, or none at all. iOS revokes a subscription that
         receives a push and shows nothing, so fall through to the default
         below rather than returning early. */
    }

    const config = await readConfig();
    const ar = (config.lang || 'ar') === 'ar';

    const title =
      (ar ? data.title_ar : data.title_en) ||
      data.title_en || data.title_ar || data.title || 'مسبحة';
    const body =
      (ar ? data.body_ar : data.body_en) ||
      data.body_en || data.body_ar || data.body || '';

    await self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Right-to-left when the app is in Arabic, so the text is not reversed
      // in the shade on a device whose own language is English.
      dir: ar ? 'rtl' : 'ltr',
      lang: ar ? 'ar' : 'en',
      tag: data.tag || 'up-message',
      // A replacement should arrive quietly; the first one already buzzed.
      renotify: false,
      data: { url: data.url || '/', id: data.id || null },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const url = new URL(target, self.location.origin);
    // Off-origin links open in a new tab; there is no window of ours to reuse.
    if (url.origin !== self.location.origin) {
      await self.clients.openWindow(url.href);
      return;
    }

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    // An app that is already open is focused and navigated rather than opened
    // a second time -- on iOS a second window is a second copy of the PWA.
    for (const client of windows) {
      if (new URL(client.url).origin !== url.origin) continue;
      await client.focus();
      if ('navigate' in client && client.url !== url.href) {
        await client.navigate(url.href).catch(() => {});
      }
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});

/* The push service can retire a subscription on its own -- a key rotation, a
   long silence -- and the browser fires this instead of telling the page. The
   page may never open again, so the worker re-subscribes and re-registers here
   or the device silently stops receiving anything. */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const config = await readConfig();
    if (!config.vapid) return;

    try {
      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: config.vapid,
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: fresh.toJSON(),
          tz: config.tz || 'UTC',
          reminderHour:
            typeof config.reminderHour === 'number' ? config.reminderHour : null,
          platform: config.platform || null,
        }),
      });
    } catch (err) {
      /* Nothing useful to do without a page: the next launch re-subscribes. */
    }
  })());
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

  // The API is state, not content. A cached GET here would show an admin last
  // hour's subscriber count, or answer a push-state check for a device whose
  // subscription has since changed. Straight to the network, always.
  if (url.pathname.startsWith('/api/')) return;

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
