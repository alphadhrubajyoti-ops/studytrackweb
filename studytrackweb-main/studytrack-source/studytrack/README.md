# StudyTrack - Your Study. Your Progress.

An offline-first, installable study-time tracker for school students. Built with React, TypeScript, Vite, Tailwind CSS v4, IndexedDB (Dexie) and a Workbox service worker. No backend, no accounts: all study data stays in the browser.

## Run it

```bash
npm install
npm run dev        # development server
npm run check      # typecheck + format check + all tests + production build
npm run build      # production build into dist/
npm run preview    # serve dist/ locally (use this to try install/offline)
```

Requires Node 20+. Individual scripts: `typecheck`, `lint`, `format`, `test`.

## Deploy (static hosting, no server)

The build uses relative paths (`base: './'`) and hash routing (`#/log`), so it works on any static host with no rewrite rules.

**Cloudflare Pages** - connect the repo, build command `npm run build`, output directory `dist`. Or: `npx wrangler pages deploy dist`.

**GitHub Pages** - push the repo, then either upload `dist/` to a `gh-pages` branch or use a GitHub Actions workflow that runs `npm ci && npm run build` and publishes `dist`. It works in a project sub-path such as `user.github.io/studytrack/`.

Serve over HTTPS (both hosts do). Service workers and install prompts need it.

## Features

Timer (start / pause / resume / finish, crash recovery), Quick add, Study Log (search, subject and date filters, sorting, edit, delete), Calendar, Reports (day, week, month, year, custom range), streaks and records, subjects (colour and icon), daily-target history, light/dark/system theme and accent colours, 12/24-hour time, first day of week, optional reminders, optional PIN lock, JSON backup and restore, installable PWA with offline shell and update prompt.

## Architecture

```
src/
  db/        Dexie schema + repositories (subjects, sessions, settings, backup). All writes are transactions.
  lib/       Pure logic: time helpers, session maths, stats/streaks, validation, palette, PIN hashing
  hooks/     Data provider (live queries), clock, theme, toasts, page visibility
  components Layout (sidebar / bottom bar), timer, modals, forms, UI primitives
  pages/     Home, StudyLog, Calendar, Reports (lazy-loaded), Settings, Onboarding
  pwa/       Service worker registration, install prompt, notifications
  test/      Test setup and UI tests (unit and database tests sit beside their code)
```

## How the important parts work

**Timer accuracy.** A session stores `startAt`, `endAt` and a list of pause intervals as epoch timestamps. Elapsed time is always *computed* from those (`lib/sessionMath.ts`); the one-second interval only triggers a re-render. A throttled background tab, a locked phone or a closed browser therefore never loses time: the next render recomputes from timestamps. Paused time is excluded by construction.

**One active session.** Starting checks for a running session and inserts inside a single IndexedDB transaction, which the browser serialises across tabs. Simultaneous starts (double click, two tabs) result in exactly one session. Pause, resume and finish are idempotent. Dexie live queries keep every tab in sync.

**Forgotten sessions.** The running session writes a heartbeat (`lastSeenAt`) every 30 s while visible. If a session is older than 6 hours the app offers "Finish at <last time the app was open>" or "Keep going". Nothing is ended automatically, because studying with the phone locked is legitimate.

**Midnight, DST and time zones.** Instants are stored as UTC epoch ms; "days" are derived in the device's local zone. A session crossing midnight keeps its original start/end and its study time is split across the local days it covers (including 23- and 25-hour DST days). If the device time zone changes, history is re-bucketed into the new zone's days.

**Reports are never stored.** Every total is calculated from session records, so editing or deleting a session updates dashboard, calendar, reports, streaks and records immediately.

**Definitions.**
- Study day: a local day with at least 1 minute of study time.
- Current streak: consecutive study days ending today; if today has no study yet, the streak ending yesterday still counts (the day is not over). Longest streak: the best run ever.
- Daily goal history: changing the target applies from today onwards; earlier days keep the target that applied then.
- Goal completion: share of days (from your first study day to the end of the range or today) on which the target was met. Consistency: share of those days with any study.

**Overlaps.** Manual and edited sessions may not overlap another session (or the running one), so study time is never counted twice. Back-to-back sessions are fine.

**Deleting subjects.** "Remove" hides the subject but keeps its history (restorable). "Delete permanently" deletes its sessions too and requires typing DELETE.

**Database versioning.** Schema version 1 is in `src/db/db.ts`. For future changes add a new `db.version(n).stores({...}).upgrade(...)` block; never edit a released version.

## Privacy and storage limits (please read)

- Nothing is sent to any server. There are no accounts, analytics or network calls apart from loading the site itself.
- Data lives in this browser profile only. Clearing site data, uninstalling the browser or using private browsing can erase it, and different browsers/devices do not share data. Use Settings > Backup regularly. "Protect data" asks the browser for persistent storage, which reduces the chance of automatic cleanup but is not a guarantee.
- The PIN lock is a convenience screen. The PIN is stored only as a salted PBKDF2 hash, but the study data itself is not encrypted: anyone with access to the device profile or developer tools can read it. A forgotten PIN cannot be recovered (clear site data, which deletes records, or restore from your own backup).
- Backups omit the PIN hash.

## Mobile shell, swipe navigation and launch splash (v1.1)

- `components/Layout.tsx` is a viewport-pinned shell (`.app-shell` in `index.css`). Only `<main class="app-scroll">` scrolls; the
  bottom bar sits below it, so it cannot move or be covered. Keep new page content inside normal block/grid layouts and use
  `grid-cols-1` before any `lg:grid-cols-*`.
- Swipe: `hooks/useSwipeNav.ts` + `lib/swipe.ts` (thresholds in `SWIPE`). Put `data-no-swipe` on any element that needs its own
  horizontal gesture (e.g. a draggable chart).
- Splash: markup and CSS in `index.html`; it is faded out and removed by `Gate` in `App.tsx` once the database is ready.
- Logo files: `src/logo.png`, `src/brand/*` (in-app), `public/brand/*` (splash), `public/icons/*`, favicons.
- Android WebView (Kodular): enable JavaScript and DOM storage on the WebViewer. Websites cannot run timers in the
  background; the timer stays accurate because it is computed from timestamps when the app is shown again.

## Upload to GitHub and deploy on Cloudflare Pages

1. Unzip, copy the contents of this folder over your existing repository folder (keep your `.git`). Do not commit `node_modules` or `dist`.
2. `git add -A && git commit -m "StudyTrack 1.1: mobile layout, swipe navigation, new logo" && git push`
3. Cloudflare Pages rebuilds from your existing settings: build command `npm run build`, output directory `dist`.
   (If your repository root is the parent folder, keep your current "root directory" setting.)
4. Open the site once online so the service worker updates; the app shows a "new version" prompt - tap Reload.
   Existing students keep their data: it lives in the browser's IndexedDB under the same name and version.

## Known limitations

- **Reminders** only fire while StudyTrack is open or kept alive by the browser. Websites cannot schedule notifications for a closed app. iOS supports notifications only for installed web apps (iOS 16.4+).
- **Installation** is a PWA, not a native app: no background execution, no Play Store listing. iOS has no install button; use Share > Add to Home Screen. Splash screens are generated by Android/Chrome from the manifest; iOS shows a plain splash.
- The timer cannot tick while the browser is suspended, but it stays *accurate* (timestamps). The tab title and display refresh as soon as the page wakes.
- Data is per-browser; there is no sync between devices.
- Quick add cannot log a single session longer than 24 hours or in the future.
- Only schema version 1 exists, so no upgrade migrations have run yet.

## Testing

`npm test` runs 65 tests (Vitest, jsdom, fake-indexeddb, Testing Library) in the `America/New_York` zone so DST behaviour is exercised: timer maths, pause/resume, midnight and DST allocation, totals, streaks, goals, validation, database transactions, duplicate/overlap prevention, concurrent starts, recovery after reopening the database, subject deletion, backup/restore, and UI flows (onboarding, navigation, empty states, timer controls, Quick add, edit/delete, search, calendar, reports, settings, PIN lock).

Not covered by automated tests: real-browser rendering at phone/tablet/desktop sizes, real tab-switching and phone-lock behaviour, service-worker offline behaviour, install prompts, and notifications. Test those manually on a device after deploying (see checklist below).

### Manual device checklist
1. Open the deployed site on a phone and a desktop; check navigation, forms and charts at several widths and in both themes.
2. Install it (Chrome/Edge: Install; iOS: Add to Home Screen). Turn on airplane mode and reopen: the app should still load.
3. Start a session, lock the phone for a few minutes, unlock: time should have advanced. Close the browser, reopen: the session should still be running.
4. Open two tabs and press Start in both: only one session should be created.
5. Add a Quick add session that crosses midnight and check both days in the Calendar.
