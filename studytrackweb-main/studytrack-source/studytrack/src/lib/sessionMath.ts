/**
 * Pure session maths. Elapsed study time is ALWAYS derived from stored timestamps
 * (start, end, pause intervals) - never from a counter that has to keep ticking.
 */
import type { Pause, Session } from '../types';
import { dateKey, nextMidnight } from './time';

export type Segment = [number, number];

/** The study (non-paused) intervals of a session. `now` is used while it is unfinished. */
export function workingSegments(session: Session, pauses: Pause[], now: number): Segment[] {
  const start = session.startAt;
  const end = session.endAt ?? now;
  if (!(end > start)) return [];
  const sorted = [...pauses].sort((a, b) => a.pausedAt - b.pausedAt);
  const out: Segment[] = [];
  let cursor = start;
  for (const p of sorted) {
    const ps = Math.max(p.pausedAt, start);
    const pe = Math.min(p.resumedAt ?? end, end);
    if (pe <= ps) continue;
    if (ps > cursor) out.push([cursor, ps]);
    cursor = Math.max(cursor, pe);
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
}

export function sumSegments(segs: Segment[]): number {
  let t = 0;
  for (const [a, b] of segs) t += Math.max(0, b - a);
  return t;
}

/** Study time in ms (paused time excluded, never negative). */
export function activeMs(session: Session, pauses: Pause[], now: number): number {
  return sumSegments(workingSegments(session, pauses, now));
}

/** Total time spent paused within the session span. */
export function pausedMs(session: Session, pauses: Pause[], now: number): number {
  const end = session.endAt ?? now;
  const span = Math.max(0, end - session.startAt);
  return Math.max(0, span - activeMs(session, pauses, now));
}

/** Split study time across local calendar days (handles sessions crossing midnight). */
export function allocateByDay(segs: Segment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [a, b] of segs) {
    let cur = a;
    while (cur < b) {
      const next = Math.min(b, nextMidnight(cur));
      const key = dateKey(cur);
      out.set(key, (out.get(key) ?? 0) + (next - cur));
      cur = next;
    }
  }
  return out;
}

export function groupPauses(pauses: Pause[]): Map<string, Pause[]> {
  const m = new Map<string, Pause[]>();
  for (const p of pauses) {
    const list = m.get(p.sessionId);
    if (list) list.push(p);
    else m.set(p.sessionId, [p]);
  }
  return m;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
