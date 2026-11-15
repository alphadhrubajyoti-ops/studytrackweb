/**
 * Date helpers. All "day" logic uses the device's LOCAL calendar. Instants are stored as
 * epoch milliseconds, so they stay correct if the device time zone changes later; day
 * boundaries are simply re-derived in whichever zone the device is in when you look.
 */
import type { WeekStart } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole-day index that is immune to DST (uses UTC arithmetic on the calendar fields). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDaysKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d.getTime());
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** First local midnight strictly after `ms`. */
export function nextMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

export function startOfWeekKey(key: string, weekStart: WeekStart): string {
  const d = parseDateKey(key);
  const diff = (d.getDay() - weekStart + 7) % 7;
  return addDaysKey(key, -diff);
}

export function monthStartKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function monthEndKey(key: string): string {
  const d = parseDateKey(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
}

export function listDayKeys(from: string, to: string): string[] {
  const out: string[] = [];
  const n = dayNumber(to) - dayNumber(from);
  for (let i = 0; i <= n && i < 4000; i++) out.push(addDaysKey(from, i));
  return out;
}

/** Combine a local date key and 'HH:MM' into epoch ms. */
export function combineDateTime(key: string, hhmm: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(ms: number, hour12: boolean): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12 });
}

export function formatHHMMLabel(value: string, hour12: boolean): string {
  const [h, m] = value.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  });
}

export function formatDateLong(key: string): string {
  return parseDateKey(key).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateShort(key: string): string {
  return parseDateKey(key).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function formatDateWithYear(key: string): string {
  return parseDateKey(key).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonthYear(key: string): string {
  return parseDateKey(key).toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export function weekdayShort(key: string): string {
  return parseDateKey(key).toLocaleDateString([], { weekday: 'short' });
}

/** "1h 25m", "45m", "0m"; seconds only for very short durations. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return total === 0 ? '0m' : `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Minutes-resolution label that rounds to nearest minute ("1h 25m"). */
export function formatDurationRounded(ms: number): string {
  const mins = Math.round(Math.max(0, ms) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function hoursDecimal(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}
