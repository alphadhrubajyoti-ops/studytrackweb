/**
 * Pure helpers for swipe navigation between the five main pages.
 * Kept free of React and the DOM (except `isSwipeBlocked`) so the rules are easy to unit test.
 */

export const SWIPE = {
  /** Finger travel (px) after which we decide whether a gesture is horizontal or vertical. */
  lockSlop: 10,
  /** A deliberate swipe travels at least this far... */
  minDistance: 64,
  /** ...or travels at least `fastDistance` at `minVelocity` (a quick flick). */
  fastDistance: 40,
  minVelocity: 0.5, // px per ms
  /** Horizontal travel must beat vertical travel by this factor, so diagonal drags are ignored. */
  horizontalRatio: 1.8,
  /** Slow drags (text selection, hesitation) are not swipes. */
  maxDurationMs: 900,
} as const;

export type SwipeIntent = 'next' | 'prev' | null;

/** Decide whether a finished touch gesture is a page swipe. dx < 0 means the finger moved left. */
export function resolveSwipe(dx: number, dy: number, dtMs: number): SwipeIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE.fastDistance) return null;
  if (ax < ay * SWIPE.horizontalRatio) return null;
  if (dtMs > SWIPE.maxDurationMs) return null;
  const velocity = ax / Math.max(dtMs, 1);
  const deliberate = ax >= SWIPE.minDistance || velocity >= SWIPE.minVelocity;
  if (!deliberate) return null;
  return dx < 0 ? 'next' : 'prev';
}

/** Index to move to, or null when already at the first/last page (no wrap-around). */
export function swipeTarget(index: number, count: number, intent: SwipeIntent): number | null {
  if (!intent || index < 0 || index >= count) return null;
  const next = intent === 'next' ? index + 1 : index - 1;
  return next >= 0 && next < count ? next : null;
}

/** Position of a path in the ordered list of main pages ('/' is the first). -1 when not a main page. */
export function pageIndex(pathname: string, paths: readonly string[]): number {
  if (pathname === '/' || pathname === '') return paths.indexOf('/');
  return paths.findIndex((p) => p !== '/' && (pathname === p || pathname.startsWith(p + '/')));
}

const BLOCKING =
  'input, textarea, select, option, [contenteditable=""], [contenteditable="true"], ' +
  '[role="slider"], [role="dialog"], [data-no-swipe]';

/** True when a gesture that starts on `target` belongs to that element, not to page navigation. */
export function isSwipeBlocked(target: EventTarget | null, boundary: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(BLOCKING)) return true;
  // Anything inside that genuinely scrolls sideways keeps its own horizontal gesture.
  for (let el: Element | null = target; el && el !== boundary; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}
