import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { loadSettings } from '../db/settings';
import {
  DEFAULT_SETTINGS,
  type Goal,
  type Pause,
  type Session,
  type Settings,
  type Subject,
} from '../types';
import { groupPauses } from '../lib/sessionMath';
import {
  buildDayMap,
  computeRecords,
  computeStreaks,
  type DayMap,
  type Records,
  type Streaks,
} from '../lib/stats';
import { dateKey } from '../lib/time';
import { usePageVisible } from './usePageVisible';

export interface AppData {
  ready: boolean;
  subjects: Subject[];
  subjectById: Map<string, Subject>;
  sessions: Session[];
  pauses: Pause[];
  pausesBySession: Map<string, Pause[]>;
  goals: Goal[];
  settings: Settings;
  running: Session | undefined;
  /** Timestamp used for statistics; refreshes every 15s while a session is running. */
  statsNow: number;
  todayKey: string;
  dayMap: DayMap;
  streaks: Streaks;
  records: Records;
}

const Ctx = createContext<AppData | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const pauses = useLiveQuery(() => db.pauses.toArray(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const settings = useLiveQuery(() => loadSettings(), []);
  const visible = usePageVisible();

  const running = useMemo(
    () => sessions?.find((s) => s.status === 'active' || s.status === 'paused'),
    [sessions],
  );

  const [statsNow, setStatsNow] = useState(() => Date.now());
  useEffect(() => {
    setStatsNow(Date.now());
    if (!running || !visible) return;
    const t = setInterval(() => setStatsNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [running, visible]);

  // Re-derive "today" when the tab becomes visible again or the local date rolls over.
  const [todayKey, setTodayKey] = useState(() => dateKey(Date.now()));
  useEffect(() => {
    const check = () => setTodayKey(dateKey(Date.now()));
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [visible]);

  const value = useMemo<AppData>(() => {
    const ss = sessions ?? [];
    const pausesBySession = groupPauses(pauses ?? []);
    const now = Math.max(statsNow, Date.now() - 20_000);
    const dayMap = buildDayMap(ss, pausesBySession, now);
    const st = settings ?? DEFAULT_SETTINGS;
    return {
      ready: !!(subjects && sessions && pauses && goals && settings),
      subjects: subjects ?? [],
      subjectById: new Map((subjects ?? []).map((s) => [s.id, s])),
      sessions: ss,
      pauses: pauses ?? [],
      pausesBySession,
      goals: goals ?? [],
      settings: st,
      running,
      statsNow: now,
      todayKey,
      dayMap,
      streaks: computeStreaks(dayMap, todayKey),
      records: computeRecords(ss, pausesBySession, dayMap, st.weekStart, now),
    };
  }, [subjects, sessions, pauses, goals, settings, running, statsNow, todayKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
