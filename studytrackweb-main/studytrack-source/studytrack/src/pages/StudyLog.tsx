import { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { SessionRow } from '../components/SessionRow';
import { SessionDetail } from '../components/SessionDetail';
import { SessionFormModal } from '../components/SessionFormModal';
import { activeMs } from '../lib/sessionMath';
import { dateKey, formatDateLong, formatDurationRounded } from '../lib/time';
import type { Session } from '../types';

type Sort = 'newest' | 'oldest' | 'longest' | 'shortest';

export default function StudyLog() {
  const { sessions, subjects, subjectById, pausesBySession, dayMap, statsNow } = useData();
  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [detail, setDetail] = useState<Session | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = sessions.filter((s) => {
      if (subjectId && s.subjectId !== subjectId) return false;
      const k = dateKey(s.startAt);
      if (from && k < from) return false;
      if (to && k > to) return false;
      if (needle) {
        const hay =
          `${subjectById.get(s.subjectId)?.name ?? ''} ${s.chapter} ${s.topic} ${s.notes}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dur = (s: Session) => activeMs(s, pausesBySession.get(s.id) ?? [], statsNow);
    list.sort((a, b) =>
      sort === 'newest'
        ? b.startAt - a.startAt
        : sort === 'oldest'
          ? a.startAt - b.startAt
          : sort === 'longest'
            ? dur(b) - dur(a)
            : dur(a) - dur(b),
    );
    return list;
  }, [sessions, q, subjectId, from, to, sort, subjectById, pausesBySession, statsNow]);

  const grouped = useMemo(() => {
    if (sort === 'longest' || sort === 'shortest') return null;
    const m = new Map<string, Session[]>();
    for (const s of rows) {
      const k = dateKey(s.startAt);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [rows, sort]);

  const filtered = !!(q || subjectId || from || to);
  const totalMs = rows.reduce(
    (t, s) => t + activeMs(s, pausesBySession.get(s.id) ?? [], statsNow),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Study Log"
        subtitle={
          sessions.length
            ? `${rows.length} ${rows.length === 1 ? 'session' : 'sessions'} - ${formatDurationRounded(totalMs)}`
            : 'Every session you save appears here.'
        }
        actions={
          <button className="btn btn-primary min-h-10" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Quick add
          </button>
        }
      />

      {sessions.length > 0 && (
        <div className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_1fr]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className="field pl-10"
              type="search"
              aria-label="Search sessions"
              placeholder="Search subject, chapter, notes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="field"
            aria-label="Filter by subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">All subjects</option>
            {[...subjects]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.archivedAt ? ' (removed)' : ''}
                </option>
              ))}
          </select>
          <input
            className="field"
            type="date"
            aria-label="From date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className="field"
            type="date"
            aria-label="To date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
          <select
            className="field"
            aria-label="Sort sessions"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="longest">Longest first</option>
            <option value="shortest">Shortest first</option>
          </select>
          {filtered && (
            <button
              className="btn btn-ghost min-h-10 sm:col-span-2 lg:col-span-5 lg:justify-self-start"
              onClick={() => {
                setQ('');
                setSubjectId('');
                setFrom('');
                setTo('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="log"
            title="Your study history starts here"
            text="Time a session from Home, or add something you already studied."
            action={
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={18} /> Quick add
              </button>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="search"
            title="No sessions match"
            text="Try a different search or clear the filters."
          />
        </div>
      ) : grouped ? (
        <div className="space-y-4">
          {grouped.map(([k, list]) => (
            <section key={k} className="card p-3 sm:p-4" aria-label={formatDateLong(k)}>
              <div className="mb-1 flex items-baseline justify-between px-2">
                <h2 className="font-display text-base font-semibold">{formatDateLong(k)}</h2>
                <span
                  className="text-sm font-semibold tabular text-accent-strong"
                  title="Study time on this day, including time from sessions that cross midnight"
                >
                  {formatDurationRounded(dayMap.get(k)?.totalMs ?? 0)}
                </span>
              </div>
              {list.map((s) => (
                <SessionRow key={s.id} session={s} showDate={false} onOpen={setDetail} />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <section className="card p-3 sm:p-4">
          {rows.map((s) => (
            <SessionRow key={s.id} session={s} onOpen={setDetail} />
          ))}
        </section>
      )}

      <SessionDetail session={detail} onClose={() => setDetail(null)} />
      <SessionFormModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
