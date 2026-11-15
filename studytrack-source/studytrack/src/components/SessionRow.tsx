import { useData } from '../hooks/useData';
import { SubjectDot } from './ui';
import { activeMs } from '../lib/sessionMath';
import { dateKey, formatDateShort, formatDuration, formatTime } from '../lib/time';
import type { Session } from '../types';

export function SessionRow({
  session,
  onOpen,
  showDate = true,
}: {
  session: Session;
  onOpen: (s: Session) => void;
  showDate?: boolean;
}) {
  const { subjectById, pausesBySession, settings, statsNow } = useData();
  const subject = subjectById.get(session.subjectId);
  const ms = activeMs(session, pausesBySession.get(session.id) ?? [], statsNow);
  const sameDay = session.endAt ? dateKey(session.endAt) === dateKey(session.startAt) : true;
  return (
    <button
      onClick={() => onOpen(session)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-sunken"
    >
      <SubjectDot subject={subject} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{subject?.name ?? 'Deleted subject'}</span>
        <span className="block truncate text-sm text-muted">
          {session.chapter}
          {session.topic ? ` - ${session.topic}` : ''}
        </span>
        <span className="block text-xs text-muted">
          {showDate && `${formatDateShort(dateKey(session.startAt))}, `}
          {formatTime(session.startAt, settings.hour12)}
          {session.endAt
            ? ` to ${formatTime(session.endAt, settings.hour12)}${sameDay ? '' : ' (next day)'}`
            : ' - running'}
        </span>
      </span>
      <span className="font-display text-base font-semibold tabular">{formatDuration(ms)}</span>
    </button>
  );
}
