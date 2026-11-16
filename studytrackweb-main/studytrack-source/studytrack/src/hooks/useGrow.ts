import { useEffect, useState } from 'react';

/**
 * Returns 0 on the first paint and `target` on the next frame, so a CSS transition on the consumer
 * animates from empty to full when it appears, and between values afterwards. Purely visual:
 * callers keep using the real value for text and accessibility.
 */
export function useGrow(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setValue(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return value;
}
