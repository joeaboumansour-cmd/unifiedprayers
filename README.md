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
- Environment variables: see `.env.example`. The two `NEXT_PUBLIC_SUPABASE_*`
  values if you want accounts; `SUPABASE_SECRET_KEY`, the `VAPID_*` pair and
  `CRON_SECRET` as well if you want notifications. Anything named
  `NEXT_PUBLIC_*` is inlined at build time, so changing one needs a redeploy
  rather than a restart; the rest are read per request.

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

2. Run the files in `supabase/migrations/` in order in the SQL editor (or
   `supabase db push` if the project is linked). Every table they create has
   RLS on:

   - `0001` — `user_prefs` and `user_progress`, each row readable and writable
     only by the account that owns it, and `content_documents`, world-readable
     and writable by nobody.
   - `0002` — `profiles` and `user_private`, splitting what other signed-in
     people may see from what only the owner may.
   - `0003` — `app_admins`, `verses`, `announcements`, `app_settings`, and the
     admin write policies for `content_documents`. See **Admin** below.
   - `0004` — `push_subscriptions` and `notifications`. See **Notifications**.
   - `0005` — `prayer_sessions`, the log the home-screen stats are counted from.
   - `0006` — the morning message: its schedule columns, and `streak_for()`.

3. Optionally seed the prayer text from what is in the bundle today. This also
   gives the admin tab's Content section its three rows to edit:

   ```bash
   npm run seed:content
   ```

   It reads `SUPABASE_SECRET_KEY` from `.env.local`. That key bypasses every
   RLS policy: keep it in `.env.local`, which is gitignored, and never anywhere
   the browser can reach.

4. Enable the Email provider under Authentication → Providers. Sign-in is by
   email and password; there is no OAuth provider, which would mean
   maintaining a client and secret with Google for a single button.

5. Add every origin the app is served from under Authentication → URL
   Configuration. Both the signup confirmation and the password reset send
   `window.location.origin` as the redirect, and Supabase rejects an origin
   that is not on that list — so a preview deployment needs its own entry.

6. Turn these on under Authentication → Providers → Email, and Policies. They
   are the settings that actually decide how hard this is to attack, and none
   of them can be set from the code in this repo:

   - **Confirm email** — on. Without it an account is usable before anyone
     proves they own the address.
   - **Minimum password length** — 10, to match `PASSWORD_MIN` in
     `src/lib/username.ts`. The form's check is a courtesy; this is the rule.
   - **Leaked password protection** — on. It checks new passwords against
     Have I Been Pwned, which is worth more than any composition rule.

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
- No verses, or the fetch fails → the verse bundled in `design.json` shows, as
  it did before there was a table.
- No VAPID keys → the notifications card reads "not available right now"
  instead of offering a switch that could not deliver anything.

## Accounts

Sign-in is optional and always has been: nothing in the prayer app is gated on
it, and every screen works signed out and offline. The account pages live at
`/login` (sign in, sign up and forgot-password in one page) and
`/reset-password` (where the emailed link lands).

`0002_profiles.sql` adds two tables, split along a permission boundary rather
than by subject:

- **`profiles`** — username, display name, avatar. Readable by *any* signed-in
  user, because finding a friend or showing who sent a novena reminder needs
  it. Anonymous visitors get nothing.
- **`user_private`** — the optional phone number, readable only by its owner.

The split is the point. Keeping the phone out of `profiles` means a future
"search for a friend" query cannot leak it by accident: the boundary is the
table, so it does not depend on whoever writes that query remembering to leave
a column out of the SELECT.

**Usernames** are stored lowercase and unique. Case-insensitive uniqueness is
not cosmetic — allowing both `joseph` and `Joseph` is an impersonation vector
as soon as profiles are visible to other people. Presentation casing goes in
`display_name`, which has no uniqueness at all. The rules live in
`username_is_valid()` and are mirrored for the form in `src/lib/username.ts`;
if the two ever disagree, the database wins and the form is the bug.

Both rows are created by a trigger on `auth.users` in the same transaction as
the signup, so a taken username fails the whole signup instead of leaving an
account with no profile. The `username_available()` RPC the form calls while
you type is a courtesy; the unique index is the guarantee, and it is what
settles two people submitting the same name at the same moment.

**What the forms do about attacks.** A wrong password and an unknown address
give the same message, and the forgot-password form reports success whatever
happened — otherwise either one answers "does this address have an account?".
Password fields carry the right `autocomplete` values so a manager does not
save a new password over an old one. Repeated failed sign-ins lock the form
locally, which is UX rather than a control — anyone can reload past it, and
Supabase's endpoint rate limits are the real limit.

**Sync model.** Prefs and progress each reconcile as a whole document on
sign-in: the newer copy wins outright, compared on `prefs.updatedAt` and
`progress.at`. Merging field by field would need a timestamp per field and
would produce combinations no one chose — one device's palette beside another's
language. Writes are debounced (prefs 0.8s, progress 4s, since progress ticks
once per bead).

## Admin

One account, or a few, can publish to everyone: the verse of the day, banner and
modal messages, push notifications, and the prayer text itself. It is the fifth
tab in the app, and it appears only for an admin.

### Becoming one

There is no button for this, anywhere, on purpose. `app_admins` has RLS on and
**no insert policy at all**, so nothing reachable from a browser can create a
row in it — not a bug in a policy, not a forged request, not a compromised
account. The only things that can are the SQL editor and the secret key:

```bash
npm run grant:admin -- you@example.com
```

Sign up in the app first — the account has to exist. To take it away again:

```bash
npm run grant:admin -- you@example.com --revoke
```

The tab appears on the next reload. Nothing behind it trusts that tab: every
write is checked again by an RLS policy, and every `/api/admin` route re-checks
the caller server-side, so a non-admin who forces the tab open gets a screen
where every button is refused.

### What is in it

- **Verses** — the verse on the Today tab. Pin one to a date, or leave the date
  empty to put it in a pool that rotates one per day. A pinned verse wins. With
  the table empty, or with no network on a device that has never fetched, the
  app shows the verse bundled in `design.json` exactly as it always did.
- **Messages** — a banner at the top of the Prayers tab, or a modal over the app
  on open; the same row, with `kind` deciding which. Both take a title and body
  in both languages, an optional https link and button text, an audience
  (everyone / signed in / signed out), a start and end time, and a priority for
  when more than one is live. This is also where a promotional interstitial
  would go. Dismissals are stored per device rather than per account, because
  most readers have no account to attach one to.
- **Notifications** — see below.
- **Content** — the `design`, `prayers` and `teachings` documents as raw JSON.
  A form was rejected here: the documents are deeply nested and order-sensitive,
  and a form covering them would be a second copy of the schema to keep in step
  with `content.ts` forever. The safety net already existed — `applyContent()`
  ignores a document that fails its shape check — so the worst a bad edit does
  is leave everyone on the text that shipped. "Restore the shipped copy" is
  always one tap away, which is what makes editing this safe at all.

Both languages are required on everything publishable. A message that exists in
only one is worse than no message: whoever reads in the other language gets a
blank card and cannot tell whether the app is broken.

## Notifications

Web Push, to Android and iOS from the same code. There is one protocol, not
two — Chrome and Safari both speak RFC 8030 with RFC 8291 encryption and RFC
8292 VAPID — so no Firebase project, no APNs certificate and no native wrapper
is involved. What differs is on the device:

- **iOS 16.4+** delivers Web Push only to a PWA that has been added to the Home
  Screen. In Safari itself `PushManager` does not exist, so there is nothing to
  ask permission for. Settings detects this and shows the Add to Home Screen
  steps instead of a switch that could not work.
- **iOS requires the notification to be shown.** A push that arrives and
  displays nothing costs the subscription, so `sw.js` always calls
  `showNotification()`, including for a payload it could not parse.
- **Android** has no such rule: Chrome subscribes from a browser tab as happily
  as from an installed app.

### Setting it up

1. Generate the key pair **once, ever** — every subscription is bound to it, so
   regenerating invalidates every device that has already subscribed:

   ```bash
   npm run vapid
   ```

   Paste the output into `.env.local` and into Vercel → Settings → Environment
   Variables. `VAPID_SUBJECT` has to be a real `mailto:` or `https:` address;
   Apple refuses a subscription without one.

2. `SUPABASE_SECRET_KEY` is now needed **at runtime**, not just by the seed
   script. `push_subscriptions` has RLS on and no policies at all, so the secret
   key is the only thing that can read or write it. Set it in Vercel as a
   server-side variable.

3. Set `CRON_SECRET` to any random string. With it unset the cron endpoint
   refuses every caller and nothing scheduled is ever delivered — it fails
   closed, because an open version of that URL would be a public spam button.

4. Schedule the hourly tick. **Nothing is delivered until this is done** — the
   file is a template with placeholders and is deliberately never committed
   filled in. Fill in your URL and secret in
   `supabase/schedule.sql` and run it once in the SQL editor. It is Supabase
   pg_cron rather than Vercel Cron because Vercel's Hobby plan runs a cron job
   once a day, and once a day cannot serve "9pm where you are" — every timezone
   needs its own hour. On Vercel Pro, a `crons` entry in `vercel.json` pointing
   at the same endpoint works instead. Do one or the other, not both.

### Sending

Compose in the admin tab: title and body in both languages, where tapping it
goes, everyone or one person by username, now or at a time. Both languages
travel in the same payload and the service worker picks one when it arrives,
using the language set on the device at that moment rather than whenever it
subscribed.

Two daily messages run on their own, both per-device and both in the device's
own timezone. Each is turned on and off separately in Settings, and someone who
keeps both gets both.

**The nightly reminder** is off until a person picks an hour. The admin tab edits
its text, which is one stored string for everybody.

**The morning message** is on by default at 8am local and knows about streaks.
It has no stored text: the copy is chosen at send time from a pool in
`src/lib/server/morningCopy.ts`, per device, per day, against the streak the
account actually has — a streak of twelve is told so, a broken one is invited
back without being scolded, and someone who has never prayed is invited to
start. Milestones at 7, 30, 50, 100, 200 and 365 days get their own words. The
admin tab has only a switch for it, because a daily push to every subscriber
should be stoppable without a deploy.

The streak is computed in Postgres by `streak_for()`, not read from the device —
at 8am the device is asleep. It has to agree exactly with `computeStats()` in
`src/lib/sessions.ts`: days are the device's own `local_date`, an unprayed today
does not end a run because the day is not over, and two prayers in one day count
as one. A device that never signed in has no account to count against, so it is
greeted as someone starting out.

Both sweeps mark the devices they touched against their own local date —
`last_remind` and `last_morning` — so running the tick twice in an hour sends
once, and a retry after a timeout does not double up.

Subscriptions clean themselves up: a push service answering 404 or 410 means
that device is gone for good, and the row is deleted on the spot.

### Where the writes happen

Everything else in this app talks to PostgREST directly and lets RLS decide.
The push tables are the exception — they go through route handlers under
`/api/push` — and the reason is worth stating: a subscription is identified by
its endpoint URL, and a signed-out device has no `auth.uid()` to prove ownership
with. A policy would have to trust "I am the device that owns this endpoint",
which is the same as no policy. Doing it server-side means the endpoint never
doubles as a credential, and it is where the VAPID private key has to live
anyway. `/api/push/subscribe` also refuses any endpoint that is not on a known
push service, so it cannot be used to fire requests at an arbitrary host.

## Layout

```
public/
  sw.js                  service worker: app shell, offline, and push
  manifest.webmanifest   install metadata, icons, shortcuts
  icons/                 app icons + iOS launch images
  dove.webp mary.webp    the two centre images
src/
  app/                   layout (fonts, metadata, viewport) and the one page
    palettes.css         the six colour palettes, as CSS custom properties
    login/               sign in, sign up, forgot password
    reset-password/      where the emailed reset link lands
    api/
      push/              subscribe, unsubscribe, state — secret key only
      admin/notify/      compose, send or schedule; admin checked server-side
      cron/notifications/  the hourly tick, behind CRON_SECRET
  components/
    Home.tsx             the tabs: Prayers, Today, Library, Settings, Admin
    AccountCard.tsx      account state and sync status, in Settings
    NotificationsCard.tsx  the push switch and both daily hours, in Settings
    Announcements.tsx    the banner and the modal an admin publishes
    auth/AuthShell.tsx   shared frame, fields and inputs for the auth pages
    admin/
      AdminTab.tsx       the four admin sections
      AdminUI.tsx        shared fields, buttons and the bilingual pair
      VersesPanel.tsx    the verse of the day
      AnnouncementsPanel.tsx  banners and modals
      NotifyPanel.tsx    compose, schedule, history, reminder text, morning switch
      ContentPanel.tsx   the prayer documents as raw JSON
    Player.tsx           full-screen prayer player
    BeadVisual.tsx       arc / ring / chain / orb bead styles
    MysterySheet.tsx     mystery-set picker
    TabBar.tsx
    PwaLayer.tsx         service worker, install prompt, update toast
  lib/
    content.ts           typed access to the prayer text and UI strings,
                         and the store the Supabase copy swaps into
    state.ts             prefs/progress types, storage, and row mapping
    steps.ts             builds the flat list of steps, and bead geometry
    username.ts          username, phone and password rules for the form
    useAuth.ts           sign in/up, password reset, sign out
    useProfile.ts        the signed-in account's own profile row
    useFriends.ts        friends, requests, the bell, and the intentions wall
    useAdmin.ts          whether to render the admin tab, and nothing more
    useCloudSync.ts      mirrors prefs and progress to Supabase
    useRemoteContent.ts  overlays DB prayer text onto the bundled JSON
    useVerse.ts          today's verse, pinned or rotating
    useAnnouncements.ts  the live banner and modal, with local dismissals
    usePush.ts           permission, subscription, and the iOS install case
    useWakeLock.ts       keeps the screen on while praying
    useAmbientDrone.ts   the optional ambient tone (Web Audio, no asset)
    server/              server-only: the secret key, the push sender, morning copy
    supabase/
      client.ts          the browser client, or null when unconfigured
      types.ts           hand-written Database types
  data/
    design.json          Holy Spirit text + all UI strings, from the design
    prayers.json         the Marian rosary text
    teachings.json       Pope Francis on the seven gifts — see below
supabase/
  migrations/            the schema, as SQL
  schedule.sql           the pg_cron job template — fill in and run once
scripts/
  seed-content.mjs       seeds content_documents from the bundled JSON
  grant-admin.mjs        the only way to make someone an admin
  generate-vapid.mjs     the push key pair, generated once
```

## Notes

- **Friends.** The fourth tab, between Calendar and Settings. Friendships are
  symmetric and unowned — one row per pair, removing one removes it for both —
  and every write goes through a `SECURITY DEFINER` function in
  `0016_friends.sql`; the tables have read policies and no write policies at
  all. Four things ride on that: friend requests, an invitation link to send
  over WhatsApp, a bell that may be rung once an hour per friend, and a wall of
  intentions your friends can pray for.

  Two rules live in the database rather than in the app, deliberately. The
  bell's hour is enforced by `nudge_friend` plus a unique index on the hour
  bucket, so `/api/friends/nudge` calls it *as the signed-in user* and can only
  send a push after the database has agreed. And what a friend may see of your
  prayer life is exactly two aggregates — your streak, and whether today is
  counted — computed inside `friends_overview()`; `prayer_sessions` keeps its
  owner-only policy from 0005, and "Share activity with friends" in Settings
  turns even the aggregates off.

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
  so a correction survives going offline. `up_verses_v1` and
  `up_announcements_v1` cache the verse pool and the live messages for the same
  reason, and `up_dismissed_v1` remembers which messages you have closed —
  per device, since most readers have no account to attach that to. Signing in
  mirrors the first two to your account as well.
- **Install prompt.** Appears shortly after first load. Chrome and Edge get a
  real install button via `beforeinstallprompt`; iOS Safari gets Add to Home
  Screen instructions, since it has no install API. "Later" is respected for
  seven days. The prompt is English-only by design; the app itself is
  bilingual.
- **Offline.** The shell — HTML, JS, CSS, self-hosted fonts, images, icons —
  is precached on install, so the app opens and every prayer is readable with
  no connection. Bump `CACHE_VERSION` in `public/sw.js` when the shell changes.
  Navigations are cached under their own path: storing every one under `/`, as
  an earlier version did, meant a single visit to `/login` replaced the offline
  shell, and praying offline opened the sign-in form instead of the app.
- **`teachings.json`** holds the eight teaching popups from the original app
  (Pope Francis on each of the seven gifts, plus *هلم أيها الروح القدس*). The
  new design has nowhere to show them yet, so nothing imports it — it is kept
  so the content is not lost.
