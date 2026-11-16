import { useEffect, useRef, type RefObject } from 'react';
import { SWIPE, isSwipeBlocked, resolveSwipe, swipeTarget } from '../lib/swipe';

interface Options {
  /** Current page position; -1 disables swiping (not on a main page). */
  index: number;
  count: number;
  onNavigate: (index: number) => void;
}

interface Track {
  x: number;
  y: number;
  t: number;
  axis: 'x' | 'y' | null;
}

/**
 * Left/right swipe between pages. Touch listeners are passive and never call preventDefault, so
 * vertical scrolling, taps, text selection and form fields behave exactly as before. The element
 * should use `touch-action: pan-y` (see .app-scroll) so the browser leaves horizontal gestures alone.
 */
export function useSwipeNav(ref: RefObject<HTMLElement | null>, opts: Options) {
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let track: Track | null = null;

    const onStart = (e: TouchEvent) => {
      track = null;
      if (e.touches.length !== 1) return; // pinch / multi-finger
      if (latest.current.index < 0) return;
      if (document.querySelector('[aria-modal="true"]')) return; // a dialog is open
      if (window.visualViewport && window.visualViewport.scale > 1.02) return; // user is zoomed in
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // selecting text
      if (isSwipeBlocked(e.target, el)) return;
      const t = e.touches[0];
      track = { x: t.clientX, y: t.clientY, t: e.timeStamp, axis: null };
    };

    const onMove = (e: TouchEvent) => {
      if (!track || track.axis) return;
      if (e.touches.length !== 1) {
        track = null;
        return;
      }
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - track.x);
      const dy = Math.abs(t.clientY - track.y);
      if (Math.max(dx, dy) < SWIPE.lockSlop) return;
      // Once a gesture is clearly vertical it is a scroll for its whole lifetime.
      track.axis = dy > dx ? 'y' : 'x';
      if (track.axis === 'y') track = null;
    };

    const onEnd = (e: TouchEvent) => {
      const tr = track;
      track = null;
      if (!tr || tr.axis !== 'x') return;
      const t = e.changedTouches[0];
      if (!t) return;
      const intent = resolveSwipe(t.clientX - tr.x, t.clientY - tr.y, e.timeStamp - tr.t);
      const { index, count, onNavigate } = latest.current;
      const to = swipeTarget(index, count, intent);
      if (to !== null) onNavigate(to);
    };

    const onCancel = () => {
      track = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [ref]);
}
