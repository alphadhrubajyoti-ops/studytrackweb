import { useState } from 'react';
import { useData } from '../hooks/useData';
import { useToast } from '../hooks/useToast';
import { ConfirmDialog, Modal, SubjectDot } from './ui';
import { Icon } from './Icon';
import { SessionFormModal } from './SessionFormModal';
import { deleteSession } from '../db/sessions';
import { errorMessage } from '../db/errors';
import { activeMs, allocateByDay, pausedMs, workingSegments } from '../lib/sessionMath';
import { formatDateLong, formatDuration, formatTime } from '../lib/time';
import type { Session } from '../types';

export function SessionDetail({
  session,
  onClose,
}: {
  session: Session | null;
  onClose: () => void;
}) {
  const { subjectById, pausesBySession, settings } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Always show the latest stored version of the session.
  const { sessions } = useData();
  const live = session ? sessions.find((s) => s.id === session.id) : undefined;

  if (!session || !live) return null;
  const subject = subjectById.get(live.subjectId);
  const pauses = pausesBySession.get(live.id) ?? [];
  const now = Date.now();
  const ms = activeMs(live, pauses, now);
  const brk = pausedMs(live, pauses, now);
  const perDay = [...allocateByDay(workingSegments(live, pauses, now))];
  const h = settings.hour12;
  const completed = live.status === 'completed';

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteSession(live!.id);
      toast.show('Session deleted.');
      setConfirming(false);
      onClose();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        open={!editing}
        onClose={onClose}
        title="Session details"
        footer={
          completed ? (
            <>
              <button className="btn btn-ghost text-danger" onClick={() => setConfirming(true)}>
                <Icon name="trash" size={18} /> Delete
              </button>
              <button className="btn btn-primary" onClick={() => setEditing(true)}>
                <Icon name="edit" size={18} /> Edit
              </button>
            </>
          ) : (
            <p className="mr-auto text-sm text-muted">Finish this session to edit or delete it.</p>
          )
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <SubjectDot subject={subject} size={44} />
            <div className="min-w-0">
              <div className="font-semibold">{subject?.name ?? 'Deleted subject'}</div>
              <div className="text-sm text-muted">{live.chapter}</div>
            </div>
            <div className="ml-auto font-display text-2xl font-semibold tabular">
              {formatDuration(ms)}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Date</dt>
            <dd>{formatDateLong(perDay[0]?.[0] ?? '')}</dd>
            <dt className="text-muted">Time</dt>
            <dd>
              {formatTime(live.startAt, h)}
              {live.endAt ? ` to ${formatTime(live.endAt, h)}` : ' - still running'}
            </dd>
            {live.topic && (
              <>
                <dt className="text-muted">Topic</dt>
                <dd>{live.topic}</dd>
              </>
            )}
            <dt className="text-muted">Breaks</dt>
            <dd>
              {pauses.length === 0
                ? 'None'
                : `${pauses.length} (${formatDuration(brk)} not counted)`}
            </dd>
            <dt className="text-muted">Added</dt>
            <dd>{live.source === 'timer' ? 'With the timer' : 'Manually (Quick add)'}</dd>
          </dl>
          {perDay.length > 1 && (
            <div className="rounded-xl bg-sunken p-3 text-sm">
              <div className="mb-1 font-semibold">Split across days</div>
              {perDay.map(([k, v]) => (
                <div key={k} className="flex justify-between text-muted">
                  <span>{formatDateLong(k)}</span>
                  <span className="tabular">{formatDuration(v)}</span>
                </div>
              ))}
            </div>
          )}
          {live.notes && (
            <div>
              <div className="mb-1 text-sm font-semibold">Notes</div>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-sunken p-3 text-sm">
                {live.notes}
              </p>
            </div>
          )}
        </div>
      </Modal>
      <SessionFormModal
        open={editing}
        session={live}
        onClose={() => {
          setEditing(false);
        }}
      />
      <ConfirmDialog
        open={confirming}
        title="Delete this session?"
        confirmLabel="Delete session"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {formatDuration(ms)} of {subject?.name ?? 'study'} time will be removed from your reports,
          calendar and streaks. This cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
