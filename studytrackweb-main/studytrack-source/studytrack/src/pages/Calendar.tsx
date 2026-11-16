import { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, Progress, SubjectDot } from '../components/ui';
import { SessionRow } from '../components/SessionRow';
import { SessionDetail } from '../components/SessionDetail';
import { SessionFormModal } from '../components/SessionFormModal';
import { MIN_STUDY_DAY_MS, metTarget, targetMsFor } from '../lib/stats';
import {
  addDaysKey,
  dateKey,
  formatDateLong,
  formatDurationRounded,
  formatMonthYear,
  monthEndKey,
  monthStartKey,
  parseDateKey,
  startOfWeekKey,
  listDayKeys,
  dayNumber,
} from '../lib/time';
import type { Session } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const { todayKey, dayMap, goals, settings, sessions, subjectById, streaks } = useData();
  const [month, setMonth] = useState(monthStartKey(todayKey));
  const [selected, setSelected] = useState(todayKey);
  const [detail, setDetail] = useState<Session | null>(null);
  const [adding, setAdding] = useState(false);

  const cells = useMemo(() => {
    const first = startOfWeekKey(month, settings.weekStart);
    const last = addDaysKey(startOfWeekKey(monthEndKey(month), settings.weekStart), 6);
    return listDayKeys(first, last);
  }, [month, settings.weekStart]);

  // Days belonging to the current streak, for a subtle connector style.
  const currentStreak = streaks.current;
  const streakDays = useMemo(() => {
    const set = new Set<string>();
    if (currentStreak > 0) {
      const endKey =
        (dayMap.get(todayKey)?.totalMs ?? 0) >= MIN_STUDY_DAY_MS
          ? todayKey
          : addDaysKey(todayKey, -1);
      for (let i = 0; i < currentStreak; i++) set.add(addDaysKey(endKey, -i));
    }
    return set;
  }, [currentStreak, dayMap, todayKey]);

  const dayStat = dayMap.get(selected);
  const daySessions = useMemo(() => {
    const ids = new Set(dayStat?.sessionIds ?? []);
    return sessions.filter((s) => ids.has(s.id)).sort((a, b) => a.startAt - b.startAt);
  }, [sessions, dayStat]);

  const weekdayOrder = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(settings.weekStart + i) % 7]);
  const shift = (n: number) => {
    const d = parseDateKey(month);
    d.setMonth(d.getMonth() + n);
    setMonth(dateKey(d.getTime()));
  };
  const selMs = dayStat?.totalMs ?? 0;
  const selTarget = targetMsFor(goals, selected);
  const monthStudyDays = listDayKeys(month, monthEndKey(month)).filter(
    (k) => (dayMap.get(k)?.totalMs ?? 0) >= MIN_STUDY_DAY_MS,
  ).length;
  const isFuture = dayNumber(selected) > dayNumber(todayKey);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={`${monthStudyDays} study ${monthStudyDays === 1 ? 'day' : 'days'} in ${formatMonthYear(month)}`}
      />
      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-3 sm:p-5" aria-label="Month view">
          <div className="mb-3 flex items-center justify-between">
            <button
              className="grid h-11 w-11 place-items-center rounded-xl hover:bg-sunken"
              onClick={() => shift(-1)}
              aria-label="Previous month"
            >
              <Icon name="left" />
            </button>
            <div className="text-center">
              <h2 className="font-display text-lg font-semibold">{formatMonthYear(month)}</h2>
              {month !== monthStartKey(todayKey) && (
                <button
                  className="text-xs font-semibold text-accent-strong"
                  onClick={() => {
                    setMonth(monthStartKey(todayKey));
                    setSelected(todayKey);
                  }}
                >
                  Back to today
                </button>
              )}
            </div>
            <button
              className="grid h-11 w-11 place-items-center rounded-xl hover:bg-sunken"
              onClick={() => shift(1)}
              aria-label="Next month"
            >
              <Icon name="right" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
            {weekdayOrder.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid">
            {cells.map((k) => {
              const inMonth = k.slice(0, 7) === month.slice(0, 7);
              const ms = dayMap.get(k)?.totalMs ?? 0;
              const studied = ms >= MIN_STUDY_DAY_MS;
              const met = metTarget(dayMap, goals, k);
              const ratio = Math.min(1, ms / targetMsFor(goals, k));
              const isSel = k === selected;
              const label = `${formatDateLong(k)}: ${studied ? formatDurationRounded(ms) + ' studied' + (met ? ', target met' : '') : 'no study'}`;
              return (
                <button
                  key={k}
                  role="gridcell"
                  aria-label={label}
                  aria-selected={isSel}
                  aria-current={k === todayKey ? 'date' : undefined}
                  onClick={() => {
                    setSelected(k);
                    if (!inMonth) setMonth(monthStartKey(k));
                  }}
                  className={`relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl border text-sm transition-colors ${
                    isSel ? 'border-accent-strong ring-2 ring-accent/40' : 'border-transparent'
                  } ${inMonth ? '' : 'opacity-35'} ${studied ? 'text-ink' : 'text-muted'} hover:bg-sunken`}
                  style={
                    studied
                      ? {
                          background: `color-mix(in srgb, var(--accent) ${Math.round(14 + ratio * 40)}%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span
                    className={`tabular ${k === todayKey ? 'grid h-6 w-6 place-items-center rounded-full bg-ink font-bold text-paper' : 'font-semibold'}`}
                  >
                    {parseDateKey(k).getDate()}
                  </span>
                  <span className="mt-0.5 hidden text-[0.62rem] leading-none tabular sm:block">
                    {studied ? formatDurationRounded(ms) : ''}
                  </span>
                  {met && (
                    <span
                      className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold"
                      aria-hidden="true"
                    />
                  )}
                  {streakDays.has(k) && (
                    <span
                      className="absolute inset-x-2 bottom-1 h-0.5 rounded-full bg-gold/70"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" /> Daily target met
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-gold/70" /> Current streak
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-accent/40" /> Darker means more study
            </span>
          </div>
        </section>

        <section className="card p-5" aria-label={`Details for ${formatDateLong(selected)}`}>
          <h2 className="font-display text-lg font-semibold">{formatDateLong(selected)}</h2>
          {selMs < 1 ? (
            <EmptyState
              icon="calendar"
              title={isFuture ? 'This day is still ahead' : 'No study recorded'}
              text={
                isFuture
                  ? 'Come back after you have studied.'
                  : 'Forgot to start the timer? Add what you studied on this day.'
              }
              action={
                !isFuture && (
                  <button className="btn btn-soft" onClick={() => setAdding(true)}>
                    <Icon name="plus" size={18} /> Add a session
                  </button>
                )
              }
            />
          ) : (
            <>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <div className="font-display text-3xl font-semibold tabular">
                    {formatDurationRounded(selMs)}
                  </div>
                  <div className="text-sm text-muted">
                    {daySessions.length} {daySessions.length === 1 ? 'session' : 'sessions'}
                  </div>
                </div>
                <div className="text-right text-sm text-muted">
                  {selMs >= selTarget ? (
                    <span className="font-semibold text-gold">Target met</span>
                  ) : (
                    `${formatDurationRounded(selTarget - selMs)} short of target`
                  )}
                </div>
              </div>
              <Progress className="mt-3" value={selMs / selTarget} />
              <h3 className="mb-2 mt-5 text-sm font-semibold">By subject</h3>
              <ul className="space-y-2">
                {Object.entries(dayStat!.bySubject)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, ms]) => (
                    <li key={id} className="flex items-center gap-3">
                      <SubjectDot subject={subjectById.get(id)} size={30} />
                      <span className="flex-1 truncate text-sm font-semibold">
                        {subjectById.get(id)?.name ?? 'Deleted subject'}
                      </span>
                      <span className="text-sm tabular text-muted">
                        {formatDurationRounded(ms)}
                      </span>
                    </li>
                  ))}
              </ul>
              <h3 className="mb-1 mt-5 text-sm font-semibold">Sessions</h3>
              <div>
                {daySessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    showDate={dateKey(s.startAt) !== selected}
                    onOpen={setDetail}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      <SessionDetail session={detail} onClose={() => setDetail(null)} />
      <SessionFormModal open={adding} onClose={() => setAdding(false)} defaultDate={selected} />
    </div>
  );
}
