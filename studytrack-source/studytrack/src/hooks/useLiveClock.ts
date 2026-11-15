import { useEffect, useState } from 'react';
import { usePageVisible } from './usePageVisible';

/**
 * Returns Date.now(), refreshed every second while the page is visible and `enabled`.
 * The value is only a DISPLAY trigger: elapsed time is always recomputed from stored
 * timestamps, so a throttled/suspended tab shows the correct time the moment it wakes up.
 */
export function useLiveClock(enabled: boolean, intervalMs = 1000): number {
  const visible = usePageVisible();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!enabled || !visible) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [enabled, visible, intervalMs]);
  return now;
}
