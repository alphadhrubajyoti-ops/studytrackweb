# Test report (v1.1)

Environment for this report: sandbox with **no internet**, so `npm install` was impossible.
That means `npm run build`, `tsc`, ESLint, Prettier and the full Vitest suite were **NOT run**. Run `npm run check` once on your machine.

## What was actually executed
| Check | Result |
|---|---|
| Data layer diff vs original (`src/db`, `lib/*` except palette/swipe, `useData`, `types`, `constants`) | identical |
| Syntax parse of every `.ts/.tsx` file (esbuild) | all parse |
| Your existing `lib.test.ts` (timer math, midnight/DST allocation, stats) via a small Vitest shim, TZ=America/New_York | 26/26 pass |
| New `swipe.test.ts` rules | 13/13 pass |
| Real Chromium, real `Layout.tsx` + `useSwipeNav` + Tailwind-compiled project CSS, stand-in pages, 320/360/375/390/412/430 px x 5 pages | no sideways overflow, no card past screen, nav pinned (never moves while scrolling), last card clears nav |
| Real touch events (CDP): swipe left x4 / right x4, ends of the list, tab + indicator sync, direction classes, no overflow mid-transition | pass |
| Swipe guards: vertical, small, diagonal, slow, text field, chart, open dialog, selected text, plain tap | pass |
| Root cause reproduced (old grid pattern pushes a card +389 px past a 360 px screen; fix removes it) | confirmed |
| Splash markup/CSS in Chromium, light + dark: fades in, centred, fades out, correct variant | pass |

## Not verified (be aware)
- Full app run: Dexie, recharts, react-router, real pages and `Gate` splash timing were not executed. The harness uses stand-in pages and a stand-in router.
- Existing `ui.test.tsx` / `db.test.ts` (need dexie, fake-indexeddb, jsdom).
- TypeScript type-check and production build.
- Real Android device / Kodular WebView, safe-area insets, on-screen keyboard behaviour.
- Reports chart rendering inside the real page, and the Calendar at 320 px with real data.
