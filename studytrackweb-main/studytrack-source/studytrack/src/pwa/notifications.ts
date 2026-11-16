import { useEffect } from 'react';
import { combineDateTime, dateKey } from '../lib/time';
import type { Settings } from '../types';

export const notificationsSupported = () => typeof Notification !== 'undefined';

export async function askNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  return Notification.requestPermission();
}

async function show(title: string, body: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg)
      return void (await reg.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        tag: 'studytrack-reminder',
      }));
  } catch {
    /* fall through to the page-level API */
  }
  try {
    new Notification(title, { body, icon: './icons/icon-192.png', tag: 'studytrack-reminder' });
  } catch {
    /* unsupported */
  }
}

/** Next local occurrence (epoch ms) of any 'HH:MM' strictly after `after`. */
export function nextReminderAt(times: string[], after: number): number | null {
  let best: number | null = null;
  for (const t of times) {
    for (const offset of [0, 1]) {
      const base = new Date(after);
      base.setDate(base.getDate() + offset);
      const at = combineDateTime(dateKey(base.getTime()), t);
      if (at > after && (best === null || at < best)) best = at;
    }
  }
  return best;
}

/**
 * Browsers cannot wake a closed web app on a schedule, so reminders fire only while
 * StudyTrack is open (or kept alive in the background by the browser).
 */
export function useReminders(settings: Settings, studiedTargetToday: boolean) {
  useEffect(() => {
    if (
      !settings.reminderEnabled ||
      !notificationsSupported() ||
      Notification.permission !== 'granted'
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const next = nextReminderAt(settings.reminderTimes, Date.now());
      if (next === null) return;
      timer = setTimeout(
        () => {
          // Only nudge when the lateness is small (not after a long sleep) and the goal is not already met.
          if (Date.now() - next < 5 * 60_000 && !studiedTargetToday) {
            void show('Time to study', 'A short session keeps your streak going.');
          }
          schedule();
        },
        Math.min(next - Date.now(), 2_000_000_000),
      );
    };
    schedule();
    const onVis = () => document.visibilityState === 'visible' && schedule();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [settings.reminderEnabled, settings.reminderTimes, studiedTargetToday]);
}
