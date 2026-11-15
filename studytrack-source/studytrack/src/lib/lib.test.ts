import { describe, expect, it } from 'vitest';
import type { Goal, Pause, Session } from '../types';
import { activeMs, allocateByDay, pausedMs, workingSegments } from './sessionMath';
import {
  buildDayMap,
  computeRecords,
  computeStreaks,
  goalCompletionRate,
  metTarget,
  rangeTotal,
  targetMinutesFor,
  weekTotals,
} from './stats';
import {
  addDaysKey,
  dateKey,
  formatClock,
  formatDuration,
  listDayKeys,
  nextMidnight,
  startOfWeekKey,
} from './time';
import { validateTimeRange } from './validation';

const at = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) =>
  new Date(y, m - 1, d, hh, mm, ss).getTime();
const MIN = 60_000;

function session(
  id: string,
  startAt: number,
  endAt: number | null,
  extra: Partial<Session> = {},
): Session {
  return {
    id,
    subjectId: 'math',
    chapter: 'Ch 1',
    topic: '',
    notes: '',
    startAt,
    endAt,
    status: endAt === null ? 'active' : 'completed',
    source: 'timer',
    createdAt: startAt,
    updatedAt: startAt,
    lastSeenAt: startAt,
    ...extra,
  };
}
const pause = (
  sessionId: string,
  pausedAt: number,
  resumedAt: number | null,
  id = `${sessionId}-${pausedAt}`,
): Pause => ({
  id,
  sessionId,
  pausedAt,
  resumedAt,
});
const dayMapOf = (ss: Session[], ps: Pause[] = [], now = at(2026, 11, 15, 12)) => {
  const by = new Map<string, Pause[]>();
  for (const p of ps) by.set(p.sessionId, [...(by.get(p.sessionId) ?? []), p]);
  return buildDayMap(ss, by, now);
};

describe('date helpers', () => {
  it('formats local date keys and adds days across DST changes', () => {
    expect(dateKey(at(2026, 3, 8, 23, 30))).toBe('2026-03-08');
    expect(addDaysKey('2026-03-07', 2)).toBe('2026-03-09'); // spring forward in New York
    expect(addDaysKey('2026-10-31', 2)).toBe('2026-11-02'); // fall back
    expect(addDaysKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(listDayKeys('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
  it('finds week starts for Monday, Sunday and Saturday weeks', () => {
    expect(startOfWeekKey('2026-11-15', 1)).toBe('2026-11-09'); // Sunday belongs to the Monday-week before it
    expect(startOfWeekKey('2026-11-15', 0)).toBe('2026-11-15');
    expect(startOfWeekKey('2026-11-15', 6)).toBe('2026-11-14');
  });
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(25 * MIN)).toBe('25m');
    expect(formatDuration(60 * MIN)).toBe('1h');
    expect(formatDuration(85 * MIN)).toBe('1h 25m');
    expect(formatClock(3_725_000)).toBe('01:02:05');
    expect(formatClock(-5)).toBe('00:00:00');
  });
});

describe('timer calculations', () => {
  const start = at(2026, 11, 10, 9, 0);
  it('counts plain elapsed time from timestamps', () => {
    const s = session('a', start, null);
    expect(activeMs(s, [], start + 30 * MIN)).toBe(30 * MIN);
    // A throttled / suspended tab simply calls this later with a bigger "now":
    expect(activeMs(s, [], start + 5 * 3_600_000)).toBe(5 * 3_600_000);
  });
  it('never counts paused time', () => {
    const s = session('a', start, start + 60 * MIN);
    const p = [pause('a', start + 20 * MIN, start + 30 * MIN)];
    expect(activeMs(s, p, start + 2 * 3_600_000)).toBe(50 * MIN);
    expect(pausedMs(s, p, start + 2 * 3_600_000)).toBe(10 * MIN);
  });
  it('stops the clock while currently paused and resumes accurately', () => {
    const running = session('a', start, null, { status: 'paused' });
    const open = [pause('a', start + 20 * MIN, null)];
    expect(activeMs(running, open, start + 90 * MIN)).toBe(20 * MIN);
    expect(activeMs(running, open, start + 600 * MIN)).toBe(20 * MIN);
    const resumed = [pause('a', start + 20 * MIN, start + 40 * MIN)];
    const active = session('a', start, null);
    expect(activeMs(active, resumed, start + 50 * MIN)).toBe(30 * MIN);
  });
  it('handles several pauses, overlapping pauses and pauses outside the session', () => {
    const s = session('a', start, start + 100 * MIN);
    const p = [
      pause('a', start + 10 * MIN, start + 20 * MIN),
      pause('a', start + 15 * MIN, start + 25 * MIN), // overlaps the previous one
      pause('a', start + 90 * MIN, start + 500 * MIN), // runs past the end
      pause('a', start - 50 * MIN, start - 10 * MIN), // before the start
    ];
    expect(activeMs(s, p, start + 200 * MIN)).toBe(100 * MIN - 15 * MIN - 10 * MIN);
  });
  it('never returns a negative duration (clock moved backwards)', () => {
    const s = session('a', start, null);
    expect(activeMs(s, [], start - 10 * MIN)).toBe(0);
    expect(workingSegments(s, [], start - 10 * MIN)).toEqual([]);
    expect(activeMs(session('b', start, start - MIN), [], start)).toBe(0);
  });
});

describe('midnight crossing and daily allocation', () => {
  it('splits a session across two local days', () => {
    const s = session('a', at(2026, 11, 10, 23, 30), at(2026, 11, 11, 0, 45));
    const per = allocateByDay(workingSegments(s, [], 0));
    expect(per.get('2026-11-10')).toBe(30 * MIN);
    expect(per.get('2026-11-11')).toBe(45 * MIN);
    const map = dayMapOf([s]);
    expect(map.get('2026-11-10')?.totalMs).toBe(30 * MIN);
    expect(map.get('2026-11-11')?.totalMs).toBe(45 * MIN);
    expect(activeMs(s, [], 0)).toBe(75 * MIN); // original session is preserved intact
  });
  it('excludes a pause that spans midnight from both days', () => {
    const s = session('a', at(2026, 11, 10, 23, 0), at(2026, 11, 11, 1, 0));
    const p = [pause('a', at(2026, 11, 10, 23, 40), at(2026, 11, 11, 0, 20))];
    const map = dayMapOf([s], p);
    expect(map.get('2026-11-10')?.totalMs).toBe(40 * MIN);
    expect(map.get('2026-11-11')?.totalMs).toBe(40 * MIN);
  });
  it('allocates correctly on a 25-hour day (DST ends) and a 23-hour day (DST starts)', () => {
    const fall = session('f', at(2026, 10, 31, 22, 0), at(2026, 11, 1, 3, 0)); // 6 real hours: clocks repeat 1am
    const per = allocateByDay(workingSegments(fall, [], 0));
    expect(per.get('2026-10-31')).toBe(2 * 3_600_000);
    expect(per.get('2026-11-01')).toBe(4 * 3_600_000);
    expect(nextMidnight(at(2026, 11, 1, 0, 30)) - at(2026, 11, 1)).toBe(25 * 3_600_000);
    const spring = session('s', at(2026, 3, 7, 23, 0), at(2026, 3, 8, 4, 0)); // 4 real hours
    const per2 = allocateByDay(workingSegments(spring, [], 0));
    expect(per2.get('2026-03-07')).toBe(3_600_000);
    expect(per2.get('2026-03-08')).toBe(3 * 3_600_000);
  });
  it('is stable if the session crosses several midnights', () => {
    const s = session('a', at(2026, 11, 10, 20, 0), at(2026, 11, 12, 4, 0));
    const per = allocateByDay(workingSegments(s, [], 0));
    expect([...per.values()].reduce((a, b) => a + b, 0)).toBe(32 * 3_600_000);
    expect(per.get('2026-11-11')).toBe(24 * 3_600_000);
  });
});

describe('daily, weekly and monthly totals', () => {
  const ss = [
    session('1', at(2026, 11, 9, 10), at(2026, 11, 9, 11)), // Mon 60
    session('2', at(2026, 11, 11, 10), at(2026, 11, 11, 10, 30)), // Wed 30
    session('3', at(2026, 11, 15, 18), at(2026, 11, 15, 19, 30), { subjectId: 'sci' }), // Sun 90
    session('4', at(2026, 11, 2, 9), at(2026, 11, 2, 9, 45)), // previous week 45
    session('5', at(2026, 10, 30, 9), at(2026, 10, 30, 10)), // previous month 60
  ];
  const map = dayMapOf(ss);
  it('totals a day with subject breakdown', () => {
    expect(map.get('2026-11-15')?.totalMs).toBe(90 * MIN);
    expect(map.get('2026-11-15')?.bySubject).toEqual({ sci: 90 * MIN });
  });
  it('totals a week and a month', () => {
    expect(rangeTotal(map, '2026-11-09', '2026-11-15')).toBe(180 * MIN);
    expect(rangeTotal(map, '2026-11-01', '2026-11-30')).toBe(225 * MIN);
    expect(rangeTotal(map, '2026-10-01', '2026-10-31')).toBe(60 * MIN);
  });
  it('totals per week using the chosen first day of week', () => {
    const mon = weekTotals(map, 1).find((w) => w.weekStart === '2026-11-09');
    const sun = weekTotals(map, 0).find((w) => w.weekStart === '2026-11-15');
    expect(mon?.totalMs).toBe(180 * MIN);
    expect(sun?.totalMs).toBe(90 * MIN);
  });
  it('computes personal records', () => {
    const rec = computeRecords(ss, new Map(), map, 1, at(2026, 11, 15, 12));
    expect(rec.bestDay).toEqual({ date: '2026-11-15', totalMs: 90 * MIN });
    expect(rec.bestWeek?.totalMs).toBe(180 * MIN);
    expect(rec.longestSession?.ms).toBe(90 * MIN);
    expect(rec.mostStudiedSubject?.subjectId).toBe('math'); // 60+30+45+60 vs 90
  });
});

describe('streaks', () => {
  const day = (d: number, mins = 30) =>
    session(`d${d}`, at(2026, 11, d, 10), at(2026, 11, d, 10, mins));
  it('counts consecutive study days ending today', () => {
    expect(computeStreaks(dayMapOf([day(13), day(14), day(15)]), '2026-11-15')).toEqual({
      current: 3,
      longest: 3,
    });
  });
  it('keeps the streak alive until the day is over, then breaks it', () => {
    const map = dayMapOf([day(13), day(14)]);
    expect(computeStreaks(map, '2026-11-15').current).toBe(2); // today not studied yet
    expect(computeStreaks(map, '2026-11-16').current).toBe(0); // a whole day was skipped
    expect(computeStreaks(map, '2026-11-16').longest).toBe(2);
  });
  it('does not count tiny sessions as a study day, and never inflates', () => {
    const tiny = session('t', at(2026, 11, 14, 10), at(2026, 11, 14, 10, 0, 20));
    expect(computeStreaks(dayMapOf([day(13), tiny, day(15)]), '2026-11-15')).toEqual({
      current: 1,
      longest: 1,
    });
    expect(computeStreaks(dayMapOf([]), '2026-11-15')).toEqual({ current: 0, longest: 0 });
  });
  it('finds the longest streak in the past', () => {
    const ss = [1, 2, 3, 4, 8, 9, 15].map((d) => day(d));
    expect(computeStreaks(dayMapOf(ss), '2026-11-15')).toEqual({ current: 1, longest: 4 });
  });
  it('counts a midnight-crossing session on both days and recalculates after deletion', () => {
    const cross = session('c', at(2026, 11, 13, 23, 30), at(2026, 11, 14, 0, 30));
    const base = [day(12), cross, day(15)];
    expect(computeStreaks(dayMapOf(base), '2026-11-15').current).toBe(4);
    expect(computeStreaks(dayMapOf(base.filter((s) => s.id !== 'c')), '2026-11-15').current).toBe(
      1,
    ); // deleted
    expect(computeStreaks(dayMapOf(base.filter((s) => s.id !== 'c')), '2026-11-15').longest).toBe(
      1,
    );
  });
  it('works across a month and year boundary', () => {
    const ss = [
      session('a', at(2026, 12, 31, 10), at(2026, 12, 31, 11)),
      session('b', at(2027, 1, 1, 10), at(2027, 1, 1, 11)),
    ];
    expect(computeStreaks(dayMapOf(ss), '2027-01-01').current).toBe(2);
  });
});

describe('goals', () => {
  const goals: Goal[] = [
    { id: 'g1', effectiveFrom: '2026-11-01', targetMinutes: 60 },
    { id: 'g2', effectiveFrom: '2026-11-10', targetMinutes: 120 },
  ];
  it('keeps historical targets when the goal changes', () => {
    expect(targetMinutesFor(goals, '2026-11-05')).toBe(60);
    expect(targetMinutesFor(goals, '2026-11-10')).toBe(120);
    expect(targetMinutesFor(goals, '2026-10-01')).toBe(60);
    expect(targetMinutesFor([], '2026-10-01')).toBe(120);
  });
  it('reports goal completion against the target in force that day', () => {
    const ss = [
      session('a', at(2026, 11, 5, 10), at(2026, 11, 5, 11)), // 60 vs 60 -> met
      session('b', at(2026, 11, 11, 10), at(2026, 11, 11, 11)), // 60 vs 120 -> not met
    ];
    const map = dayMapOf(ss);
    expect(metTarget(map, goals, '2026-11-05')).toBe(true);
    expect(metTarget(map, goals, '2026-11-11')).toBe(false);
    // Range starts at the first study day (Nov 5) and ends Nov 12: 8 days, 1 met.
    expect(goalCompletionRate(map, goals, '2026-11-01', '2026-11-12')).toBeCloseTo(1 / 8);
    expect(goalCompletionRate(dayMapOf([]), goals, '2026-11-01', '2026-11-12')).toBeNull();
  });
});

describe('input validation', () => {
  const now = at(2026, 11, 15, 12);
  it('rejects negative, zero, tiny, huge and future ranges', () => {
    expect(validateTimeRange({ startAt: now - 3600_000, endAt: now - 7200_000 }, now)).toMatch(
      /after the start/,
    );
    expect(validateTimeRange({ startAt: now - 3600_000, endAt: now - 3600_000 }, now)).toMatch(
      /after the start/,
    );
    expect(
      validateTimeRange({ startAt: now - 3600_000, endAt: now - 3600_000 + 20_000 }, now),
    ).toMatch(/1 minute/);
    expect(validateTimeRange({ startAt: now - 30 * 3600_000, endAt: now - 3600_000 }, now)).toMatch(
      /24 hours/,
    );
    expect(validateTimeRange({ startAt: now + 3600_000, endAt: now + 7200_000 }, now)).toMatch(
      /future/,
    );
    expect(validateTimeRange({ startAt: NaN, endAt: now }, now)).toMatch(/valid/);
  });
  it('accepts a normal and a midnight-crossing session', () => {
    expect(validateTimeRange({ startAt: now - 3600_000, endAt: now - 600_000 }, now)).toBeNull();
    expect(
      validateTimeRange({ startAt: at(2026, 11, 14, 23, 0), endAt: at(2026, 11, 15, 1, 0) }, now),
    ).toBeNull();
  });
});
