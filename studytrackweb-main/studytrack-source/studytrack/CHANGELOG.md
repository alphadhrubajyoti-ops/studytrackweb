# Changelog

## 1.1.0 - Mobile layout, swipe navigation, new logo, motion

### Student data
- **No change to the data layer.** `src/db/*`, `src/lib/{sessionMath,stats,time,validation,lock}.ts`,
  `src/hooks/useData.tsx`, `src/types.ts` and `src/constants.ts` are byte-identical to the previous version.
  The IndexedDB schema is still version 1, so no migration runs and existing sessions, subjects,
  goals, running/paused sessions and settings are read exactly as before.
- Navigation, swipes and animations only change CSS classes and which page component is shown.
  Timers are still computed from stored timestamps; nothing animates or resets them.

### Fixed
- **Stylesheet.** `src/index.css` contained only a few tap-highlight rules: Tailwind itself, the colour tokens
  (`bg-card`, `text-muted`, ...), `.btn*`, `.card`, `.field`, `.tabular`, `.safe-*` and `.anim-*` were missing.
  Rebuilt with the same class names the components already use. Fonts (Figtree, Literata) are imported in `main.tsx`.
- **Content cut off on the right / sideways scrolling.** Page layouts used `grid gap-4 lg:grid-cols-2`. On a phone that is a
  single *auto* column, which grows to fit its widest child (charts, long names) and pushes past the screen.
  All such grids now use `grid-cols-1` (= `minmax(0, 1fr)`), grid children may shrink (`min-width: 0`), long words wrap,
  and the Reports period tabs / date stepper fit 320 px. Horizontal overflow is not hidden to cover this up.
- **Bottom navigation drifting or hiding.** It was `position: fixed` inside a page that could grow wider than the screen,
  which makes mobile browsers zoom out and shift fixed elements. The app is now a viewport-pinned shell: only `<main>`
  scrolls and the bottom bar is a normal flex child under it, with safe-area padding. It no longer depends on `100vh`.
- Content no longer needs bottom padding to dodge the bar, because the bar no longer overlaps it.

### Added
- **Swipe navigation** Home > Study Log > Calendar > Reports > Settings. Same routes as the bottom bar (one navigation system).
  Ignored for: vertical scroll, diagonal or slow drags, small movements, form fields, dialogs, selected text, pinch-zoom,
  sideways-scrolling areas and anything marked `data-no-swipe` (Reports chart).
- **New logo** (from `StudyTrack__Progress_in_Motion.png`): app icons, favicons, apple-touch icon, maskable icon, in-app mark
  (light and dark versions), sidebar, onboarding and lock screen.
- **Launch splash:** the logo fades in at the centre while the app loads, then fades out (min. ~1.4 s from page load;
  0.3 s with reduced motion). It is plain HTML/CSS in `index.html`, so it shows before JavaScript starts.
- **Motion** (transform/opacity only; honours `prefers-reduced-motion`): direction-aware page transitions, sliding tab
  indicator, card entrance, progress bars/ring/weekly bars filling from zero, modal enter *and exit*, button press feedback,
  live pulse on the running session, check-mark draw on session completion, smooth theme change, Reports chunk preloaded
  while idle so swiping to Reports is instant.
- "Emerald" accent matching the logo green (optional; existing choice is unchanged).
- Unit tests for the swipe rules (`src/lib/swipe.test.ts`).

### Visual
- Flatter, calmer look: hairline borders instead of shadows, lighter page background, same sage palette, same typography.
