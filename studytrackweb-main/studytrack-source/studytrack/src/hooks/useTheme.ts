import { useEffect, useRef, useState } from 'react';
import { ACCENTS } from '../lib/palette';
import type { Settings } from '../types';

export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Applies theme mode + accent colour to <html>. Re-runs when the OS theme changes. */
export function useApplyTheme(theme: Settings['theme'], accentKey: string) {
  const first = useRef(true);
  useEffect(() => {
    const el = document.documentElement;
    // Fade colours for a moment when the user switches theme or accent (not on app start).
    let fade: ReturnType<typeof setTimeout> | undefined;
    if (!first.current) {
      el.classList.add('theme-anim');
      fade = setTimeout(() => el.classList.remove('theme-anim'), 350);
    }
    first.current = false;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      el.classList.toggle('dark', dark);
      const a = ACCENTS.find((x) => x.key === accentKey) ?? ACCENTS[0];
      const c = dark ? a.dark : a.light;
      el.style.setProperty('--accent', c.accent);
      el.style.setProperty('--accent-strong', c.strong);
      el.style.setProperty('--accent-soft', c.soft);
    };
    apply();
    mq.addEventListener?.('change', apply);
    return () => {
      clearTimeout(fade);
      mq.removeEventListener?.('change', apply);
    };
  }, [theme, accentKey]);
}
