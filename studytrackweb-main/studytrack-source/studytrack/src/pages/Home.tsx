import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { Icon } from '../components/Icon';
import {
  EmptyState,
  GrowBar,
  PageHeader,
  Progress,
  ProgressRing,
  Skeleton,
  Stat,
  SubjectDot,
} from '../components/ui';
import { ActiveSessionCard, FinishSummary, StartLearning } from '../components/Timer';
import { SessionFormModal } from '../components/SessionFormModal';
import { SessionRow } from '../components/SessionRow';
import { SessionDetail } from '../components/SessionDetail';
import { bySubjectInRange, rangeStudyDays, rangeTotal, targetMsFor } from '../lib/stats';
import {
  addDaysKey,
  dateKey,
  dayNumber,
  formatDateWithYear,
  formatDurationRounded,
  listDayKeys,
  monthEndKey,
  monthStartKey,
  startOfWeekKey,
  weekdayShort,
} from '../lib/time';
import type { Session } from '../types';

function greeting(h: number) {
  return h < 5
    ? 'Late night'
    : h < 12
      ? 'Good morning'
      : h < 17
        ? 'Good afternoon'
        : 'Good evening';
}

function message(todayMs: number, targetMs: number, streak: number, hasAny: boolean): string {
  if (!hasAny) return 'Start your first session and your progress will appear here.';
  if (todayMs >= targetMs) return 'Daily target reached. Anything more is a bonus.';
  if (todayMs <= 0)
    return streak > 0
      ? `A ${streak}-day streak is waiting. One session keeps it going.`
      : 'A short session is a good way to begin today.';
  const left = targetMs - todayMs;
  if (left <= 20 * 60_000) return `Almost there - ${formatDurationRounded(left)} to go.`;
  return `${Math.round((todayMs / targetMs) * 100)}% of today's target done. Keep the rhythm.`;
}

export default function Home() {
  const d = useData();
  const [quickAdd, setQuickAdd] = useState(false);
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Session | null>(null);
  const [subjTab, setSubjTab] = useState<'week' | 'month' | 'all'>('week');

  const { todayKey, dayMap, goals, settings, streaks, records, subjectById, sessions, running } = d;
  const todayMs = dayMap.get(todayKey)?.totalMs ?? 0;
  const targetMs = targetMsFor(goals, todayKey);

  const week = useMemo(() => {
    const start = startOfWeekKey(todayKey, settings.weekStart);
    const keys = listDayKeys(start, addDaysKey(start, 6));
    const prevStart = addDaysKey(start, -7);
    const elapsed = dayNumber(todayKey) - dayNumber(start) + 1;
    const total = rangeTotal(dayMap, start, todayKey);
    const prevSame = rangeTotal(dayMap, prevStart, addDaysKey(prevStart, elapsed - 1));
    const days = keys.map((k) => ({
      key: k,
      ms: dayMap.get(k)?.totalMs ?? 0,
      future: k > todayKey,
    }));
    const peak = Math.max(targetMs, ...days.map((x) => x.ms), 1);
    return { start, days, total, prevSame, avg: total / elapsed, peak };
  }, [dayMap, todayKey, settings.weekStart, targetMs]);

  const month = useMemo(() => {
    const ms = monthStartKey(todayKey);
    const me = monthEndKey(todayKey);
    const total = rangeTotal(dayMap, ms, todayKey);
    const elapsed = dayNumber(todayKey) - dayNumber(ms) + 1;
    const goal = listDayKeys(ms, me).reduce((t, k) => t + targetMsFor(goals, k), 0);
    return { total, goal, days: rangeStudyDays(dayMap, ms, todayKey), avg: total / elapsed };
  }, [dayMap, goals, todayKey]);

  const subjectTotals = useMemo(() => {
    const [from, to] =
      subjTab === 'week'
        ? [week.start, addDaysKey(week.start, 6)]
        : subjTab === 'month'
          ? [monthStartKey(todayKey), monthEndKey(todayKey)]
          : ['0000-01-01', '9999-12-31'];
    return Object.entries(bySubjectInRange(dayMap, from, to))
      .filter(([, ms]) => ms > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [dayMap, subjTab, week.start, todayKey]);

  const recent = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.status === 'completed')
        .sort((a, b) => b.startAt - a.startAt)
        .slice(0, 5),
    [sessions],
  );

  if (!d.ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const hasAny = sessions.some((s) => s.status === 'completed') || !!running;
  const weekDiff =
    week.prevSame > 0 ? Math.round(((week.total - week.prevSame) / week.prevSame) * 100) : null;
  const subjMax = subjectTotals[0]?.[1] ?? 1;
  const subjSum = subjectTotals.reduce((t, [, v]) => t + v, 0) || 1;
  const topName = records.mostStudiedSubject
    ? subjectById.get(records.mostStudiedSubject.subjectId)?.name
    : undefined;

  return (
    <div>
      <PageHeader
        title={`${greeting(new Date().getHours())}`}
        subtitle={formatDateWithYear(todayKey)}
        actions={
          <button className="btn btn-ghost min-h-10" onClick={() => setQuickAdd(true)}>
            <Icon name="plus" size={18} /> Quick add
          </button>
        }
      />

      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card order-1 p-5 lg:order-2" aria-labelledby="start-h">
          <h2 id="start-h" className="mb-3 font-display text-lg font-semibold">
            {running ? 'Your session' : 'Start learning'}
          </h2>
          {running ? <ActiveSessionCard onFinished={setFinishedId} /> : <StartLearning />}
        </section>

        <section className="card order-2 p-5 lg:order-1" aria-labelledby="today-h">
          <h2 id="today-h" className="sr-only">
            Today
          </h2>
          <div className="flex items-center gap-5">
            <ProgressRing value={targetMs ? todayMs / targetMs : 0} size={140} stroke={13}>
              <div>
                <div className="font-display text-3xl font-semibold tabular leading-none">
                  {Math.min(999, Math.round((todayMs / targetMs) * 100))}%
                </div>
                <div className="mt-1 text-xs text-muted">of today</div>
              </div>
            </ProgressRing>
            <div className="grid min-w-0 flex-1 gap-3">
              <Stat label="Studied today" value={formatDurationRounded(todayMs)} />
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Daily target" value={formatDurationRounded(targetMs)} />
                <Stat
                  label="Remaining"
                  value={todayMs >= targetMs ? 'Done' : formatDurationRounded(targetMs - todayMs)}
                />
              </div>
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-strong">
            {message(todayMs, targetMs, streaks.current, hasAny)}
          </p>
        </section>

        <section className="card order-3 p-5" aria-labelledby="week-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="week-h" className="font-display text-lg font-semibold">
              This week
            </h2>
            <span className="font-display text-xl font-semibold tabular">
              {formatDurationRounded(week.total)}
            </span>
          </div>
          <div
            className="flex h-36 items-end gap-2"
            role="img"
            aria-label="Study time for each day this week"
          >
            {week.days.map((day) => {
              const h = Math.max(day.ms > 0 ? 4 : 0, (day.ms / week.peak) * 100);
              const met = day.ms >= targetMs && day.ms > 0;
              return (
                <div
                  key={day.key}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <div className="relative flex w-full flex-1 items-end rounded-md bg-sunken/60">
                    <GrowBar
                      pct={h}
                      className={`${met ? 'bg-gold' : 'bg-accent'} ${day.key === todayKey ? '' : 'opacity-80'}`}
                      title={`${weekdayShort(day.key)}: ${formatDurationRounded(day.ms)}`}
                    />
                  </div>
                  <span
                    className={`text-[0.7rem] ${day.key === todayKey ? 'font-bold text-ink' : 'text-muted'}`}
                  >
                    {weekdayShort(day.key).slice(0, 3)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Daily average" value={formatDurationRounded(week.avg)} />
            <Stat
              label="vs last week so far"
              value={weekDiff === null ? 'No data' : `${weekDiff > 0 ? '+' : ''}${weekDiff}%`}
              sub={
                weekDiff === null ? undefined : `${formatDurationRounded(week.prevSame)} last week`
              }
            />
          </div>
        </section>

        <section className="card order-4 p-5" aria-labelledby="month-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="month-h" className="font-display text-lg font-semibold">
              This month
            </h2>
            <span className="font-display text-xl font-semibold tabular">
              {formatDurationRounded(month.total)}
            </span>
          </div>
          <Progress value={month.goal ? month.total / month.goal : 0} />
          <p className="mt-1.5 text-xs text-muted">
            {Math.round((month.total / (month.goal || 1)) * 100)}% of the{' '}
            {formatDurationRounded(month.goal)} monthly goal
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Study days" value={month.days} />
            <Stat label="Average per day" value={formatDurationRounded(month.avg)} />
          </div>
          <Link to="/calendar" className="btn btn-soft mt-4 w-full">
            <Icon name="calendar" size={18} /> Open calendar
          </Link>
        </section>

        <section className="card order-5 p-5" aria-labelledby="subj-h">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="subj-h" className="font-display text-lg font-semibold">
              Subjects
            </h2>
            <div
              className="inline-flex rounded-lg bg-sunken p-0.5"
              role="tablist"
              aria-label="Subject period"
            >
              {(['week', 'month', 'all'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={subjTab === t}
                  onClick={() => setSubjTab(t)}
                  className={`min-h-9 rounded-md px-2.5 text-xs font-semibold ${subjTab === t ? 'bg-card shadow-sm' : 'text-muted'}`}
                >
                  {t === 'week' ? 'Week' : t === 'month' ? 'Month' : 'All time'}
                </button>
              ))}
            </div>
          </div>
          {subjectTotals.length === 0 ? (
            <EmptyState
              icon="book"
              title="No study time yet"
              text="Time you study will be split by subject here."
            />
          ) : (
            <ul className="space-y-3">
              {subjectTotals.slice(0, 6).map(([id, ms], i) => (
                <li key={id} className="flex items-center gap-3">
                  <SubjectDot subject={subjectById.get(id)} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">
                        {subjectById.get(id)?.name ?? 'Deleted subject'}
                        {i === 0 && (
                          <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[0.65rem] font-bold text-gold">
                            Most studied
                          </span>
                        )}
                      </span>
                      <span className="tabular text-muted">
                        {formatDurationRounded(ms)} - {Math.round((ms / subjSum) * 100)}%
                      </span>
                    </div>
                    <Progress value={ms / subjMax} className="mt-1" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card order-6 p-5" aria-labelledby="streak-h">
          <h2 id="streak-h" className="mb-3 font-display text-lg font-semibold">
            Streaks and records
          </h2>
          <div className="mb-4 flex items-center gap-4 rounded-xl bg-accent-soft p-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-card text-gold">
              <Icon name="flame" size={26} />
            </span>
            <div>
              <div className="font-display text-2xl font-semibold tabular">
                {streaks.current} {streaks.current === 1 ? 'day' : 'days'}
              </div>
              <div className="text-xs text-muted">Current streak - longest {streaks.longest}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Best day"
              value={records.bestDay ? formatDurationRounded(records.bestDay.totalMs) : '-'}
              sub={records.bestDay ? formatDateWithYear(records.bestDay.date) : 'No data yet'}
            />
            <Stat
              label="Best week"
              value={records.bestWeek ? formatDurationRounded(records.bestWeek.totalMs) : '-'}
              sub={
                records.bestWeek
                  ? `from ${formatDateWithYear(records.bestWeek.weekStart)}`
                  : 'No data yet'
              }
            />
            <Stat
              label="Longest session"
              value={
                records.longestSession ? formatDurationRounded(records.longestSession.ms) : '-'
              }
              sub={
                records.longestSession
                  ? formatDateWithYear(dateKey(records.longestSession.session.startAt))
                  : 'No data yet'
              }
            />
            <Stat
              label="Most studied"
              value={<span className="block truncate">{topName ?? '-'}</span>}
            />
          </div>
        </section>

        <section className="card order-7 p-5 lg:col-span-2" aria-labelledby="recent-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-h" className="font-display text-lg font-semibold">
              Recent sessions
            </h2>
            {recent.length > 0 && (
              <Link
                to="/log"
                className="min-h-10 content-center text-sm font-semibold text-accent-strong"
              >
                See all
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No sessions yet"
              text="Finish a timed session or use Quick add for something you already studied."
              action={
                <button className="btn btn-soft" onClick={() => setQuickAdd(true)}>
                  <Icon name="plus" size={18} /> Quick add
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
              {recent.map((s) => (
                <SessionRow key={s.id} session={s} onOpen={setDetail} />
              ))}
            </div>
          )}
        </section>
      </div>

      <SessionFormModal open={quickAdd} onClose={() => setQuickAdd(false)} />
      <FinishSummary sessionId={finishedId} onClose={() => setFinishedId(null)} />
      <SessionDetail session={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
