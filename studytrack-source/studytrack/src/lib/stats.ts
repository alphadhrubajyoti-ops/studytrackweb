/**
 * Reports are always calculated from the raw session records, never from stored totals.
 *
 * Definitions (also shown in the README):
 *  - A "study day" is a local day with at least MIN_STUDY_DAY_MS (1 minute) of study time.
 *  - Current streak: consecutive study days ending today. If today has no study yet, the
 *    streak ending yesterday is still alive (the day is not over), so it is never broken early
 *    and never inflated.
 *  - Goal completion: share of days in the range on which the target in force that day was met.
 *  - Consistency: share of days in the range (from the first study day) that were study days.
 */
import type { Goal, Pause, Session, WeekStart } from '../types';
import { DEFAULT_TARGET_MINUTES } from '../types';
import { activeMs, allocateByDay, groupPauses, workingSegments } from './sessionMath';
import { addDaysKey, dayNumber, listDayKeys, startOfWeekKey } from './time';

export const MIN_STUDY_DAY_MS = 60_000;

export interface DayStat {
  date: string;
  totalMs: number;
  bySubject: Record<string, number>;
  sessionIds: string[];
}

export type DayMap = Map<string, DayStat>;

export function buildDayMap(
  sessions: Session[],
  pausesBySession: Map<string, Pause[]>,
  now: number,
): DayMap {
  const map: DayMap = new Map();
  for (const s of sessions) {
    const segs = workingSegments(s, pausesBySession.get(s.id) ?? [], now);
    for (const [key, ms] of allocateByDay(segs)) {
      if (ms <= 0) continue;
      let d = map.get(key);
      if (!d) {
        d = { date: key, totalMs: 0, bySubject: {}, sessionIds: [] };
        map.set(key, d);
      }
      d.totalMs += ms;
      d.bySubject[s.subjectId] = (d.bySubject[s.subjectId] ?? 0) + ms;
      d.sessionIds.push(s.id);
    }
  }
  return map;
}

export function buildDayMapFromRaw(sessions: Session[], pauses: Pause[], now: number): DayMap {
  return buildDayMap(sessions, groupPauses(pauses), now);
}

export function rangeTotal(map: DayMap, from: string, to: string): number {
  let t = 0;
  for (const k of listDayKeys(from, to)) t += map.get(k)?.totalMs ?? 0;
  return t;
}

export function rangeStudyDays(map: DayMap, from: string, to: string): number {
  let n = 0;
  for (const k of listDayKeys(from, to)) if ((map.get(k)?.totalMs ?? 0) >= MIN_STUDY_DAY_MS) n++;
  return n;
}

export function rangeBySubject(map: DayMap, from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of listDayKeys(from, to)) {
    const d = map.get(k);
    if (!d) continue;
    for (const [id, ms] of Object.entries(d.bySubject)) out[id] = (out[id] ?? 0) + ms;
  }
  return out;
}

export function rangeSessionCount(map: DayMap, from: string, to: string): number {
  const ids = new Set<string>();
  for (const k of listDayKeys(from, to)) for (const id of map.get(k)?.sessionIds ?? []) ids.add(id);
  return ids.size;
}

export function targetMinutesFor(goals: Goal[], key: string): number {
  if (goals.length === 0) return DEFAULT_TARGET_MINUTES;
  const sorted = [...goals].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let target = sorted[0].targetMinutes; // before the first goal, use the earliest one
  for (const g of sorted) {
    if (g.effectiveFrom <= key) target = g.targetMinutes;
    else break;
  }
  return target;
}

export function targetMsFor(goals: Goal[], key: string): number {
  return targetMinutesFor(goals, key) * 60_000;
}

export function metTarget(map: DayMap, goals: Goal[], key: string): boolean {
  const total = map.get(key)?.totalMs ?? 0;
  return total > 0 && total >= targetMsFor(goals, key);
}

export function firstStudyDay(map: DayMap): string | null {
  let first: string | null = null;
  for (const [k, d] of map) {
    if (d.totalMs >= MIN_STUDY_DAY_MS && (first === null || k < first)) first = k;
  }
  return first;
}

export interface Streaks {
  current: number;
  longest: number;
}

export function computeStreaks(map: DayMap, todayKey: string): Streaks {
  const days = [...map.values()]
    .filter((d) => d.totalMs >= MIN_STUDY_DAY_MS)
    .map((d) => dayNumber(d.date))
    .sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const set = new Set(days);
  const today = dayNumber(todayKey);
  let cursor = set.has(today) ? today : set.has(today - 1) ? today - 1 : null;
  let current = 0;
  while (cursor !== null && set.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, longest };
}

export function goalCompletionRate(
  map: DayMap,
  goals: Goal[],
  from: string,
  to: string,
): number | null {
  const first = firstStudyDay(map);
  if (!first) return null;
  const start = from > first ? from : first;
  if (start > to) return null;
  const keys = listDayKeys(start, to);
  if (keys.length === 0) return null;
  const met = keys.filter((k) => metTarget(map, goals, k)).length;
  return met / keys.length;
}

export function consistencyRate(map: DayMap, from: string, to: string): number | null {
  const first = firstStudyDay(map);
  if (!first) return null;
  const start = from > first ? from : first;
  if (start > to) return null;
  const keys = listDayKeys(start, to);
  const days = keys.filter((k) => (map.get(k)?.totalMs ?? 0) >= MIN_STUDY_DAY_MS).length;
  return days / keys.length;
}

export interface WeekTotal {
  weekStart: string;
  totalMs: number;
}

export function weekTotals(map: DayMap, weekStart: WeekStart): WeekTotal[] {
  const totals = new Map<string, number>();
  for (const d of map.values()) {
    const w = startOfWeekKey(d.date, weekStart);
    totals.set(w, (totals.get(w) ?? 0) + d.totalMs);
  }
  return [...totals.entries()]
    .map(([weekStartKey, totalMs]) => ({ weekStart: weekStartKey, totalMs }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export interface Records {
  bestDay: { date: string; totalMs: number } | null;
  bestWeek: WeekTotal | null;
  longestSession: { session: Session; ms: number } | null;
  mostStudiedSubject: { subjectId: string; ms: number } | null;
}

export function computeRecords(
  sessions: Session[],
  pausesBySession: Map<string, Pause[]>,
  map: DayMap,
  weekStart: WeekStart,
  now: number,
): Records {
  let bestDay: Records['bestDay'] = null;
  for (const d of map.values()) {
    if (d.totalMs > 0 && (!bestDay || d.totalMs > bestDay.totalMs)) {
      bestDay = { date: d.date, totalMs: d.totalMs };
    }
  }
  let bestWeek: WeekTotal | null = null;
  for (const w of weekTotals(map, weekStart)) {
    if (w.totalMs > 0 && (!bestWeek || w.totalMs > bestWeek.totalMs)) bestWeek = w;
  }
  let longestSession: Records['longestSession'] = null;
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    const ms = activeMs(s, pausesBySession.get(s.id) ?? [], now);
    if (ms > 0 && (!longestSession || ms > longestSession.ms)) longestSession = { session: s, ms };
  }
  const all = bySubjectInRange(map, '0000-01-01', '9999-12-31');
  return { bestDay, bestWeek, longestSession, mostStudiedSubject: topSubject(all) };
}

/** Subject totals over an arbitrary key range without iterating thousands of day keys. */
export function bySubjectInRange(map: DayMap, from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, d] of map) {
    if (k < from || k > to) continue;
    for (const [id, ms] of Object.entries(d.bySubject)) out[id] = (out[id] ?? 0) + ms;
  }
  return out;
}

export function totalInRange(map: DayMap, from: string, to: string): number {
  let t = 0;
  for (const [k, d] of map) if (k >= from && k <= to) t += d.totalMs;
  return t;
}

export function topSubject(
  totals: Record<string, number>,
): { subjectId: string; ms: number } | null {
  let best: { subjectId: string; ms: number } | null = null;
  for (const [subjectId, ms] of Object.entries(totals)) {
    if (ms > 0 && (!best || ms > best.ms)) best = { subjectId, ms };
  }
  return best;
}

export function bottomSubject(
  totals: Record<string, number>,
): { subjectId: string; ms: number } | null {
  let worst: { subjectId: string; ms: number } | null = null;
  for (const [subjectId, ms] of Object.entries(totals)) {
    if (!worst || ms < worst.ms) worst = { subjectId, ms };
  }
  return worst;
}

export function weekKeys(todayKey: string, weekStart: WeekStart): string[] {
  const s = startOfWeekKey(todayKey, weekStart);
  return listDayKeys(s, addDaysKey(s, 6));
}
