import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useData } from '../hooks/useData';
import { EmptyState, PageHeader, Progress, Stat, SubjectDot } from '../components/ui';
import { Icon } from '../components/Icon';
import {
  MIN_STUDY_DAY_MS,
  bottomSubject,
  bySubjectInRange,
  consistencyRate,
  goalCompletionRate,
  rangeSessionCount,
  targetMsFor,
  topSubject,
  totalInRange,
  weekTotals,
} from '../lib/stats';
import { activeMs } from '../lib/sessionMath';
import {
  addDaysKey,
  dateKey,
  dayNumber,
  formatDateShort,
  formatDateWithYear,
  formatDurationRounded,
  formatMonthYear,
  hoursDecimal,
  listDayKeys,
  monthEndKey,
  monthStartKey,
  parseDateKey,
  startOfWeekKey,
  weekdayShort,
} from '../lib/time';

type Kind = 'day' | 'week' | 'month' | 'year' | 'custom';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

interface Point {
  label: string;
  ms: number;
  hours: number;
  target?: number;
}

export default function Reports() {
  const d = useData();
  const { todayKey, dayMap, goals, settings, sessions, pausesBySession, subjectById, statsNow } = d;
  const [kind, setKind] = useState<Kind>('week');
  const [anchor, setAnchor] = useState(todayKey);
  const [cFrom, setCFrom] = useState(addDaysKey(todayKey, -29));
  const [cTo, setCTo] = useState(todayKey);

  const range = useMemo(() => {
    switch (kind) {
      case 'day':
        return { from: anchor, to: anchor, title: formatDateWithYear(anchor) };
      case 'week': {
        const s = startOfWeekKey(anchor, settings.weekStart);
        return {
          from: s,
          to: addDaysKey(s, 6),
          title: `${formatDateShort(s)} - ${formatDateWithYear(addDaysKey(s, 6))}`,
        };
      }
      case 'month':
        return {
          from: monthStartKey(anchor),
          to: monthEndKey(anchor),
          title: formatMonthYear(anchor),
        };
      case 'year': {
        const y = anchor.slice(0, 4);
        return { from: `${y}-01-01`, to: `${y}-12-31`, title: y };
      }
      default: {
        const [a, b] = cFrom <= cTo ? [cFrom, cTo] : [cTo, cFrom];
        return { from: a, to: b, title: `${formatDateWithYear(a)} - ${formatDateWithYear(b)}` };
      }
    }
  }, [kind, anchor, settings.weekStart, cFrom, cTo]);

  const data = useMemo(() => {
    const { from, to } = range;
    const effectiveTo = to > todayKey ? todayKey : to;
    const elapsedDays = effectiveTo >= from ? dayNumber(effectiveTo) - dayNumber(from) + 1 : 0;
    const total = totalInRange(dayMap, from, to);
    const subjTotals = bySubjectInRange(dayMap, from, to);
    const sessionCount = rangeSessionCount(dayMap, from, to);
    const studyDays = listDayKeys(from, to).filter(
      (k) => (dayMap.get(k)?.totalMs ?? 0) >= MIN_STUDY_DAY_MS,
    ).length;

    // Chart points
    let points: Point[] = [];
    const days = dayNumber(to) - dayNumber(from) + 1;
    const byMonth = kind === 'year' || (kind === 'custom' && days > 92);
    if (byMonth) {
      const map = new Map<string, number>();
      for (const [k, st] of dayMap)
        if (k >= from && k <= to)
          map.set(k.slice(0, 7), (map.get(k.slice(0, 7)) ?? 0) + st.totalMs);
      const months: string[] = [];
      for (let m = monthStartKey(from); m <= to; m = addDaysKey(monthEndKey(m), 1))
        months.push(m.slice(0, 7));
      points = months.map((m) => ({
        label:
          kind === 'year'
            ? parseDateKey(`${m}-01`).toLocaleDateString([], { month: 'short' })
            : parseDateKey(`${m}-01`).toLocaleDateString([], { month: 'short', year: '2-digit' }),
        ms: map.get(m) ?? 0,
        hours: hoursDecimal(map.get(m) ?? 0),
      }));
    } else if (kind !== 'day') {
      points = listDayKeys(from, to).map((k) => {
        const ms = dayMap.get(k)?.totalMs ?? 0;
        return {
          label: kind === 'week' ? weekdayShort(k) : String(parseDateKey(k).getDate()),
          ms,
          hours: hoursDecimal(ms),
          target: hoursDecimal(targetMsFor(goals, k)),
        };
      });
    }

    // Best day / week / longest session inside the range
    let bestDay: { date: string; ms: number } | null = null;
    for (const [k, st] of dayMap)
      if (k >= from && k <= to && st.totalMs > 0 && (!bestDay || st.totalMs > bestDay.ms))
        bestDay = { date: k, ms: st.totalMs };
    const ws = weekTotals(dayMap, settings.weekStart).filter(
      (w) => w.weekStart >= startOfWeekKey(from, settings.weekStart) && w.weekStart <= to,
    );
    const bestWeek = ws.reduce<(typeof ws)[number] | null>(
      (b, w) => (!b || w.totalMs > b.totalMs ? w : b),
      null,
    );
    const inRange = sessions.filter(
      (s) => s.status === 'completed' && dateKey(s.startAt) >= from && dateKey(s.startAt) <= to,
    );
    let longest: { ms: number; chapter: string; subject: string } | null = null;
    let sumMs = 0;
    for (const s of inRange) {
      const ms = activeMs(s, pausesBySession.get(s.id) ?? [], statsNow);
      sumMs += ms;
      if (!longest || ms > longest.ms)
        longest = {
          ms,
          chapter: s.chapter,
          subject: subjectById.get(s.subjectId)?.name ?? 'Deleted subject',
        };
    }
    const subjList = Object.entries(subjTotals)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    return {
      byMonth,
      total,
      subjList,
      sessionCount,
      studyDays,
      points,
      bestDay,
      bestWeek,
      longest,
      avgPerDay: elapsedDays > 0 ? total / elapsedDays : 0,
      avgSession: inRange.length ? sumMs / inRange.length : 0,
      goalRate: goalCompletionRate(dayMap, goals, from, effectiveTo),
      consistency: consistencyRate(dayMap, from, effectiveTo),
      top: topSubject(subjTotals),
      bottom: subjList.length > 1 ? bottomSubject(Object.fromEntries(subjList)) : null,
    };
  }, [
    range,
    kind,
    dayMap,
    goals,
    sessions,
    pausesBySession,
    subjectById,
    settings.weekStart,
    todayKey,
    statsNow,
  ]);

  const step = (dir: 1 | -1) => {
    const k = anchor;
    if (kind === 'day') setAnchor(addDaysKey(k, dir));
    else if (kind === 'week') setAnchor(addDaysKey(k, 7 * dir));
    else if (kind === 'month') {
      const dt = parseDateKey(monthStartKey(k));
      dt.setMonth(dt.getMonth() + dir);
      setAnchor(dateKey(dt.getTime()));
    } else if (kind === 'year')
      setAnchor(`${Number(k.slice(0, 4)) + dir}-${k.slice(5)}`.replace(/-02-29$/, '-02-28'));
  };
  const canNext = range.to < todayKey;
  const maxH = Math.max(1, ...data.points.map((p) => Math.max(p.hours, p.target ?? 0)));
  const subjSum = data.total || 1;
  const hasData = data.total > 0;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Calculated from your saved sessions." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          className="flex w-full rounded-xl bg-sunken p-1 sm:inline-flex sm:w-auto"
          role="tablist"
          aria-label="Report period"
        >
          {KINDS.map((k) => (
            <button
              key={k.key}
              role="tab"
              aria-selected={kind === k.key}
              onClick={() => setKind(k.key)}
              className={`min-h-10 min-w-0 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors duration-200 sm:flex-none sm:px-3 ${kind === k.key ? 'bg-card shadow-sm' : 'text-muted'}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind !== 'custom' ? (
          <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start">
            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-sunken"
              onClick={() => step(-1)}
              aria-label="Previous period"
            >
              <Icon name="left" />
            </button>
            <span className="min-w-0 flex-1 text-center font-display font-semibold sm:min-w-[10rem] sm:flex-none">
              {range.title}
            </span>
            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-sunken disabled:opacity-30"
              onClick={() => step(1)}
              disabled={!canNext}
              aria-label="Next period"
            >
              <Icon name="right" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="field !w-auto"
              type="date"
              aria-label="Start date"
              value={cFrom}
              max={cTo}
              onChange={(e) => e.target.value && setCFrom(e.target.value)}
            />
            <span className="text-muted">to</span>
            <input
              className="field !w-auto"
              type="date"
              aria-label="End date"
              value={cTo}
              min={cFrom}
              max={todayKey}
              onChange={(e) => e.target.value && setCTo(e.target.value)}
            />
          </div>
        )}
      </div>

      {!d.sessions.length ? (
        <div className="card">
          <EmptyState
            icon="reports"
            title="No reports yet"
            text="Finish a session or add one with Quick add and your charts will appear here."
          />
        </div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="card p-5 lg:col-span-2" aria-label="Summary">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total study time" value={formatDurationRounded(data.total)} />
              <Stat label="Sessions" value={data.sessionCount} />
              <Stat label="Study days" value={data.studyDays} />
              <Stat
                label={kind === 'day' ? 'Average session' : 'Average per day'}
                value={formatDurationRounded(kind === 'day' ? data.avgSession : data.avgPerDay)}
              />
            </div>
          </section>

          {kind !== 'day' && (
            <section className="card p-5 lg:col-span-2" aria-label="Chart">
              <h2 className="mb-3 font-display text-lg font-semibold">
                {data.byMonth ? 'Study time by month' : 'Study time by day'}
              </h2>
              {!hasData ? (
                <EmptyState
                  icon="reports"
                  title="Nothing to chart"
                  text="No study time was recorded in this period."
                />
              ) : (
                <div
                  data-no-swipe
                  className="h-64 w-full min-w-0 sm:h-72"
                  role="img"
                  aria-label="Bar chart of study hours"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.points}
                      margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="var(--line)" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--muted)', fontSize: 12 }}
                        interval="preserveStartEnd"
                        minTickGap={8}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={[0, Math.ceil(maxH)]}
                        allowDecimals={false}
                        tick={{ fill: 'var(--muted)', fontSize: 12 }}
                        tickFormatter={(v: number) => `${v}h`}
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--sunken)' }}
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <div className="rounded-lg border border-line bg-card px-3 py-2 text-sm shadow">
                              <div className="font-semibold">{label}</div>
                              <div className="text-muted">
                                {formatDurationRounded((payload[0].payload as Point).ms)}
                              </div>
                            </div>
                          ) : null
                        }
                      />
                      {(kind === 'week' || kind === 'month') && data.points[0]?.target ? (
                        <ReferenceLine
                          y={data.points[0].target}
                          stroke="var(--gold)"
                          strokeDasharray="5 4"
                          label={{
                            value: 'Target',
                            fill: 'var(--muted)',
                            fontSize: 11,
                            position: 'insideTopRight',
                          }}
                        />
                      ) : null}
                      <Bar
                        dataKey="hours"
                        fill="var(--accent)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          )}

          <section className="card p-5" aria-label="Subjects">
            <h2 className="mb-3 font-display text-lg font-semibold">Subjects</h2>
            {data.subjList.length === 0 ? (
              <EmptyState
                icon="book"
                title="No subject data"
                text="No study time was recorded in this period."
              />
            ) : (
              <ul className="space-y-3">
                {data.subjList.map(([id, ms]) => (
                  <li key={id} className="flex items-center gap-3">
                    <SubjectDot subject={subjectById.get(id)} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate font-semibold">
                          {subjectById.get(id)?.name ?? 'Deleted subject'}
                        </span>
                        <span className="tabular text-muted">
                          {formatDurationRounded(ms)} - {Math.round((ms / subjSum) * 100)}%
                        </span>
                      </div>
                      <Progress value={ms / subjSum} className="mt-1" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5" aria-label="Insights">
            <h2 className="mb-3 font-display text-lg font-semibold">Insights</h2>
            {!hasData ? (
              <p className="text-sm text-muted">
                Insights appear once there is study time in this period.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Stat
                  label="Most studied"
                  value={
                    <span className="block truncate">
                      {data.top ? (subjectById.get(data.top.subjectId)?.name ?? '-') : '-'}
                    </span>
                  }
                  sub={data.top ? formatDurationRounded(data.top.ms) : undefined}
                />
                <Stat
                  label="Least studied"
                  value={
                    <span className="block truncate">
                      {data.bottom ? (subjectById.get(data.bottom.subjectId)?.name ?? '-') : '-'}
                    </span>
                  }
                  sub={data.bottom ? formatDurationRounded(data.bottom.ms) : 'Needs 2+ subjects'}
                />
                <Stat
                  label="Longest session"
                  value={data.longest ? formatDurationRounded(data.longest.ms) : '-'}
                  sub={data.longest ? `${data.longest.subject}` : undefined}
                />
                <Stat label="Average session" value={formatDurationRounded(data.avgSession)} />
                <Stat
                  label="Best day"
                  value={data.bestDay ? formatDurationRounded(data.bestDay.ms) : '-'}
                  sub={data.bestDay ? formatDateWithYear(data.bestDay.date) : undefined}
                />
                <Stat
                  label="Best week"
                  value={data.bestWeek ? formatDurationRounded(data.bestWeek.totalMs) : '-'}
                  sub={
                    data.bestWeek ? `from ${formatDateShort(data.bestWeek.weekStart)}` : undefined
                  }
                />
                <Stat
                  label="Daily goal completion"
                  value={data.goalRate === null ? '-' : `${Math.round(data.goalRate * 100)}%`}
                  sub="days the target was met"
                />
                <Stat
                  label="Consistency"
                  value={data.consistency === null ? '-' : `${Math.round(data.consistency * 100)}%`}
                  sub="days with any study"
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
