/* Service worker for Unified Prayers.
   Bump CACHE_VERSION whenever the shell needs to be re-fetched.

   The rule this file is built on: cache what cannot change under its own URL,
   and never cache anything that carries a decision. Build output under
   /_next/static/ is content-hashed and safe forever. A page, an API answer, an
   RSC payload, an announcement -- all of those are state, and a stale copy of
   state is how a message somebody switched off an hour ago is still sitting on
   a stranger's screen. Those go to the network, every time. */

const CACHE_VERSION = 'v8';
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
  '/icons/badge-96.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/audio/night-ambience.mp3',
  '/audio/birds-day.mp3',
  '/audio/page-turn.mp3',
  '/audio/piano-loop.mp3',
  '/audio/chime.mp3',
];

/* How long a navigation waits for the network before the last good copy of the
   page becomes the better answer. The fetch is not abandoned -- it still
   refreshes the cache -- this is only about what goes on screen now. */
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Added one at a time: addAll is all-or-nothing, and a single missing
    // asset should not stop the worker from installing.
    await Promise.all(PRECACHE.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
  })());
  // Deliberately no skipWaiting() here. Taking over the moment the download
  // finishes reloads whatever page is open, and on this app that page is
  // sometimes a prayer in progress. The page decides instead -- and it decides
  // within milliseconds unless somebody is mid-decade. See PwaLayer.
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

  // The escape hatch for the state this file used to be able to get into:
  // every stored page and asset dropped, without uninstalling the app.
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k.startsWith('unified-prayers-')).map(k => caches.delete(k))
      );
    })());
    return;
  }

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
      // Android draws these in two different places and wants two different
      // pictures. `icon` is the large one in the shade, so it is the logo.
      // `badge` is the small one stamped into the status bar: the system
      // throws its colours away and keeps only its alpha, so an opaque
      // square -- which is what the logo was doing here -- comes out a solid
      // white blob. badge-96 is the dove cut out on nothing.
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
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

/* ----------------------------------------------------------------- fetch -- */

const isFontHost = url =>
  url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

/* Hashed build output never changes under the same URL, so it is safe to
   serve from cache forever and fill in on first request. */
const isImmutable = url =>
  url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');

/* Pictures, icons, fonts and sounds we serve ourselves. They change only when
   their name does, so a stale one is a stale picture -- never a stale
   decision, which is the only kind of staleness that matters here. */
const STATIC_EXT = /\.(?:webp|png|jpe?g|gif|svg|ico|woff2?|ttf|otf|mp3|ogg|wav)$/i;
const isStaticAsset = url =>
  url.origin === self.location.origin && STATIC_EXT.test(url.pathname);

/* Next's flight payload for a client-side navigation: the rendered output of a
   page, under a URL that does not change when the page does. That combination
   makes it the single most dangerous thing in the app to store. */
const isRscRequest = (req, url) =>
  url.searchParams.has('_rsc') ||
  req.headers.get('RSC') === '1' ||
  req.headers.get('Next-Router-Prefetch') === '1';

/* Only a plain, complete, storable answer is worth keeping. A redirect
   replayed to a navigation throws outright, a partial is not the whole file,
   and no-store means the server asked us not to. */
function isCacheable(res) {
  return Boolean(
    res &&
    res.ok &&
    res.status === 200 &&
    !res.redirected &&
    res.type !== 'opaqueredirect' &&
    !/(?:^|,)\s*no-store(?:\s*,|$)/i.test(res.headers.get('Cache-Control') || '')
  );
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (isCacheable(res)) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (isCacheable(res) || (res && res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

/* The network is the answer; the cache is what is left when there is none.
   Everything same-origin that is neither hashed nor a static asset. */
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (isCacheable(res)) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req)) || new Response('', { status: 504 });
  }
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

  // Flight payloads and prefetches. Storing one lets a client-side navigation
  // render a page as it was days ago, with nothing in any URL to hint at it.
  if (isRscRequest(req, url)) return;

  // A query string means the request was parameterised for a reason, and the
  // reason is rarely something a cache key of ours would honour.
  if (
    url.origin === self.location.origin &&
    url.search &&
    req.mode !== 'navigate' &&
    !isImmutable(url)
  ) {
    return;
  }

  // Navigations: the network wins, and the shell is only what stands in when
  // there is no network to win with.
  if (req.mode === 'navigate') {
    // Keyed by path, so the manifest shortcuts (/?set=mary) do not each store
    // their own copy of the same page.
    const key = url.origin + url.pathname;

    event.respondWith((async () => {
      const cache = await caches.open(CACHE);

      // Caught here rather than at the await below, so the race can read a
      // failure as "no answer yet" without ever leaving a rejection loose.
      const network = (async () => {
        const preloaded = await event.preloadResponse;
        const res = preloaded || await fetch(req);
        // Each page under its own URL. Storing every navigation under '/'
        // would mean one visit to /login leaves the sign-in form as the
        // offline shell, and praying offline would open it instead of the app.
        if (isCacheable(res)) cache.put(key, res.clone());
        return res;
      })().catch(() => null);

      const timeout = new Promise(resolve =>
        setTimeout(() => resolve(null), NAV_TIMEOUT_MS)
      );

      const first = await Promise.race([network, timeout]);
      if (first) return first;

      // This page if it has been seen before, otherwise the app shell:
      // signing in needs the network anyway, and offline is for praying.
      const fallback = (await cache.match(key)) || (await cache.match('/'));
      if (fallback) return fallback;

      return (await network) || new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })());
    return;
  }

  if (isImmutable(url)) { event.respondWith(cacheFirst(req)); return; }
  if (isFontHost(url)) { event.respondWith(staleWhileRevalidate(req)); return; }
  if (isStaticAsset(url)) { event.respondWith(staleWhileRevalidate(req)); return; }
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }

  // Everything else off-origin -- Supabase above all -- is left untouched for
  // the browser to fetch. An announcement, a verse, a session: none of it may
  // ever be served out of a cache this file controls.
});



