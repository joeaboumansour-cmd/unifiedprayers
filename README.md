# Unified Prayers

An installable PWA for the Chaplet of the Holy Spirit and the Rosary of the
Virgin Mary, in Arabic and English. Next.js App Router — every route is still
prerendered as static content.

Supabase is optional throughout. With no project configured the app is exactly
what it was before: local storage, bundled prayer text, no account UI. With one
configured it adds sign-in, cross-device sync of settings and progress, and
prayer text that can be corrected without a redeploy.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

## Deploying to Vercel

Import the repository and deploy — the app sits at the repository root, so
there is nothing to configure:

- **Root Directory**: leave empty (the repo root)
- Framework preset: Next.js (detected automatically)
- Environment variables: the two `NEXT_PUBLIC_SUPABASE_*` values below, if you
  want accounts. Both are public and safe to paste into Vercel. Note they are
  inlined at build time, so changing them needs a redeploy, not just a restart.

`next.config.ts` sets `Cache-Control: max-age=0, must-revalidate` and
`Service-Worker-Allowed: /` on `/sw.js`, so a deploy always reaches installed
clients instead of being pinned by the CDN.

## Supabase

Optional. Skip all of this and the app still works.

1. Copy `.env.example` to `.env.local` and fill in the two values from
   Dashboard → Project Settings → API:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```

   Both ship in the browser bundle. That is fine and expected — Row Level
   Security is what protects the data, not the secrecy of the anon key.

2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or
   `supabase db push` if the project is linked). It creates three tables, all
   with RLS on: `user_prefs` and `user_progress`, each row readable and
   writable only by the account that owns it, and `content_documents`, which is
   world-readable and grants writes to nobody.

3. Optionally seed the prayer text from what is in the bundle today:

   ```bash
   SUPABASE_SERVICE_ROLE_KEY=... npm run seed:content
   ```

   The service_role key bypasses RLS. Keep it in `.env.local`, which is
   gitignored, and never anywhere the browser can reach.

4. Enable the Email provider under Authentication → Providers. Sign-in is by
   magic link only — no passwords, and no OAuth provider, which would mean
   maintaining a client and secret with Google for a single button. Add your
   deployed origin under Authentication → URL Configuration, since
   `signInWithOtp` sends `window.location.origin` as the redirect and Supabase
   rejects an origin that is not on that list.

**How it degrades.** Every piece of this is a no-op when it cannot reach the
network, by design:

- No env vars → `getSupabase()` returns null, the Account card does not render,
  and nothing else changes.
- Signed out → prefs and progress stay in `localStorage`, as before.
- Signed in but offline → writes fail silently and the card reads "Offline —
  will save later". The next successful write catches up.
- Content fetch fails → the app runs on the JSON in the bundle. A document that
  fails its shape check is ignored rather than adopted, so a half-written row
  cannot break the player mid-prayer.

**Sync model.** Prefs and progress each reconcile as a whole document on
sign-in: the newer copy wins outright, compared on `prefs.updatedAt` and
`progress.at`. Merging field by field would need a timestamp per field and
would produce combinations no one chose — one device's palette beside another's
language. Writes are debounced (prefs 0.8s, progress 4s, since progress ticks
once per bead).

## Layout

```
public/
  sw.js                  service worker: app shell + offline
  manifest.webmanifest   install metadata, icons, shortcuts
  icons/                 app icons + iOS launch images
  dove.webp mary.webp    the two centre images
src/
  app/                   layout (fonts, metadata, viewport) and the one page
    palettes.css         the six colour palettes, as CSS custom properties
  components/
    Home.tsx             the four tabs: Prayers, Today, Library, Settings
    AccountCard.tsx      sign-in / sync status, in Settings
    Player.tsx           full-screen prayer player
    BeadVisual.tsx       arc / ring / chain / orb bead styles
    MysterySheet.tsx     mystery-set picker
    TabBar.tsx
    PwaLayer.tsx         service worker, install prompt, update toast
  lib/
    content.ts           typed access to the prayer text and UI strings,
                         and the store the Supabase copy swaps into
    state.ts             prefs/progress types, storage, and row mapping
    useAuth.ts           session, magic link, sign out
    useCloudSync.ts      mirrors prefs and progress to Supabase
    useRemoteContent.ts  overlays DB prayer text onto the bundled JSON
    supabase/
      client.ts          the browser client, or null when unconfigured
      types.ts           hand-written Database types
supabase/
  migrations/            the schema, as SQL
scripts/
  seed-content.mjs       seeds content_documents from the bundled JSON
    steps.ts             builds the flat list of steps, and bead geometry
    useWakeLock.ts       keeps the screen on while praying
    useAmbientDrone.ts   the optional ambient tone (Web Audio, no asset)
  data/
    design.json          Holy Spirit text + all UI strings, from the design
    prayers.json         the Marian rosary text
    teachings.json       Pope Francis on the seven gifts — see below
```

## Notes

- **Palettes.** Six dark palettes chosen in Settings. Each is built the way the
  original is: a deep, cool ground with a luminous accent from the opposite
  side of the colour wheel — blue against gold, pine against rose, moss
  against lilac, petrol against salmon, slate against cream, plum against
  sage, every pair 168-180 degrees apart. A monochrome scheme (rose accent on
  a rose ground) reads as a hue wash laid over the app rather than as a colour
  scheme, so it is avoided. The muted text ramp follows the ground, not the
  accent, and card fills stay neutral white at low alpha. Every colour in the app resolves through the
  tokens in `src/app/palettes.css`, so a palette is applied by setting
  `data-palette` on `<html>`; the `theme-color` meta follows so the browser
  chrome and task-switcher card match. To add one, copy a block in that file
  and add an entry to `PALETTES` in `src/lib/content.ts`.
- **State.** `up_prefs_v1` holds language, palette, bead style, text size and
  the four toggles. `up_progress_v1` holds where you were; it resumes for 24 hours and
  then starts fresh. `up_content_v1` caches prayer text fetched from Supabase,
  so a correction survives going offline. All three are per-device; signing in
  mirrors the first two to your account as well.
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
