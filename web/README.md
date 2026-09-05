# Unified Prayers

An installable PWA for the Chaplet of the Holy Spirit and the Rosary of the
Virgin Mary, in Arabic and English. Next.js App Router, no backend — every
route is prerendered as static content.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

## Deploying to Vercel

Import the repository and point the project at this directory:

- **Root Directory**: `web`
- Framework preset: Next.js (detected automatically)
- No environment variables, no backend services

`next.config.ts` sets `Cache-Control: max-age=0, must-revalidate` and
`Service-Worker-Allowed: /` on `/sw.js`, so a deploy always reaches installed
clients instead of being pinned by the CDN.

## Layout

```
public/
  sw.js                  service worker: app shell + offline
  manifest.webmanifest   install metadata, icons, shortcuts
  icons/                 app icons + iOS launch images
  dove.webp mary.webp    the two centre images
src/
  app/                   layout (fonts, metadata, viewport) and the one page
  components/
    Home.tsx             the four tabs: Prayers, Today, Library, Settings
    Player.tsx           full-screen prayer player
    BeadVisual.tsx       arc / ring / chain / orb bead styles
    MysterySheet.tsx     mystery-set picker
    TabBar.tsx
    PwaLayer.tsx         service worker, install prompt, update toast
  lib/
    content.ts           typed access to the prayer text and UI strings
    steps.ts             builds the flat list of steps, and bead geometry
    useWakeLock.ts       keeps the screen on while praying
    useAmbientDrone.ts   the optional ambient tone (Web Audio, no asset)
  data/
    design.json          Holy Spirit text + all UI strings, from the design
    prayers.json         the Marian rosary text
    teachings.json       Pope Francis on the seven gifts — see below
```

## Notes

- **State.** `up_prefs_v1` holds language, bead style, text size and the four
  toggles. `up_progress_v1` holds where you were; it resumes for 24 hours and
  then starts fresh.
- **Install prompt.** Appears shortly after first load. Chrome and Edge get a
  real install button via `beforeinstallprompt`; iOS Safari gets Add to Home
  Screen instructions, since it has no install API. "Later" is respected for
  seven days. The prompt is English-only by design; the app itself is
  bilingual.
- **Offline.** The shell — HTML, JS, CSS, self-hosted fonts, images, icons —
  is precached on install, so the app opens and every prayer is readable with
  no connection. Bump `CACHE_VERSION` in `public/sw.js` when the shell changes.
- **`teachings.json`** holds the eight teaching popups from the original app
  (Pope Francis on each of the seven gifts, plus *هلم أيها الروح القدس*). The
  new design has nowhere to show them yet, so nothing imports it — it is kept
  so the content is not lost.
