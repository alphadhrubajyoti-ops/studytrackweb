import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { useLiveClock } from '../hooks/useLiveClock';
import { useToast } from '../hooks/useToast';
import { Icon } from './Icon';
import { Field, Modal, Progress, SubjectDot } from './ui';
import { SubjectSelect } from './SubjectSelect';
import {
  discardSession,
  finishSession,
  heartbeat,
  pauseSession,
  reopenSession,
  resumeSession,
  startSession,
} from '../db/sessions';
import { errorMessage } from '../db/errors';
import { activeMs, pausedMs } from '../lib/sessionMath';
import { formatClock, formatDuration, formatDurationRounded, formatTime } from '../lib/time';
import { targetMsFor } from '../lib/stats';
import { usePageVisible } from '../hooks/usePageVisible';

const STALE_MS = 6 * 3_600_000;

/** Heartbeat + tab title for the running session. Rendered once, near the app root. */
export function RunningSessionWatcher() {
  const { running, pausesBySession, subjectById } = useData();
  const visible = usePageVisible();
  const now = useLiveClock(!!running && running.status === 'active', 1000);

  useEffect(() => {
    if (!running || !visible) return;
    const id = running.id;
    void heartbeat(id).catch(() => {});
    const t = setInterval(() => void heartbeat(id).catch(() => {}), 30_000);
    const onHide = () => void heartbeat(id).catch(() => {});
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', onHide);
    };
  }, [running, visible]);

  useEffect(() => {
    if (!running) {
      document.title = 'StudyTrack - Your Study. Your Progress.';
      return;
    }
    const ms = activeMs(running, pausesBySession.get(running.id) ?? [], now);
    const name = subjectById.get(running.subjectId)?.name ?? 'Studying';
    document.title = `${running.status === 'paused' ? 'Paused' : formatClock(ms)} - ${name}`;
  }, [running, pausesBySession, subjectById, now]);

  return null;
}

export function useRunningElapsed() {
  const { running, pausesBySession } = useData();
  const now = useLiveClock(!!running && running.status === 'active', 1000);
  if (!running) return { now, ms: 0, paused: 0 };
  const p = pausesBySession.get(running.id) ?? [];
  return { now, ms: activeMs(running, p, now), paused: pausedMs(running, p, now) };
}

export function StartLearning() {
  const { subjects, sessions } = useData();
  const toast = useToast();
  const [subjectId, setSubjectId] = useState(
    () => localStorage.getItem('studytrack.lastSubject') ?? '',
  );
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const available = subjects.filter((s) => !s.archivedAt);
  useEffect(() => {
    if (subjectId && !available.some((s) => s.id === subjectId)) setSubjectId('');
  }, [available, subjectId]);

  const recentChapters = useMemo(() => {
    if (!subjectId) return [] as string[];
    const seen = new Set<string>();
    return [...sessions]
      .filter((s) => s.subjectId === subjectId)
      .sort((a, b) => b.startAt - a.startAt)
      .map((s) => s.chapter)
      .filter((c) => (seen.has(c) ? false : (seen.add(c), true)))
      .slice(0, 12);
  }, [sessions, subjectId]);

  async function start() {
    if (busy) return;
    setError('');
    if (!subjectId) return setError('Choose a subject to study.');
    setBusy(true);
    try {
      await startSession({ subjectId, chapter, topic, notes });
      try {
        localStorage.setItem('studytrack.lastSubject', subjectId);
      } catch {
        /* optional convenience */
      }
      setChapter('');
      setTopic('');
      setNotes('');
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      if (msg.includes('already running'))
        toast.show('A session is already running (maybe in another tab).', 'info');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <Field label="Subject" htmlFor="start-subject">
        <SubjectSelect id="start-subject" value={subjectId} onChange={setSubjectId} />
      </Field>
      <Field label="Chapter" htmlFor="start-chapter">
        <input
          id="start-chapter"
          className="field"
          list="chapter-suggestions"
          value={chapter}
          maxLength={120}
          onChange={(e) => setChapter(e.target.value)}
          placeholder="What are you studying?"
          autoComplete="off"
        />
        <datalist id="chapter-suggestions">
          {recentChapters.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-accent-strong">
          <Icon name="down" size={16} className="transition-transform group-open:rotate-180" />
          Add topic or notes
        </summary>
        <div className="mt-2 space-y-3">
          <input
            className="field"
            aria-label="Topic"
            value={topic}
            maxLength={200}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (optional)"
          />
          <textarea
            className="field"
            aria-label="Notes"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
          />
        </div>
      </details>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary w-full min-h-14 text-base tracking-wide"
        disabled={busy}
      >
        <Icon name="play" size={20} fill />
        START LEARNING NOW
      </button>
    </form>
  );
}

export function ActiveSessionCard({ onFinished }: { onFinished: (id: string) => void }) {
  const { running, subjectById } = useData();
  const { now, ms, paused } = useRunningElapsed();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  if (!running) return null;
  const subject = subjectById.get(running.subjectId);
  const isPaused = running.status === 'paused';
  const stale = !keepGoing && now - running.startAt > STALE_MS;
  const lastSeenGap = now - running.lastSeenAt;

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const finish = (at?: number) =>
    run(async () => {
      const done = await finishSession(running.id, at);
      if (done) onFinished(done.id);
    });

  return (
    <div className="space-y-4" aria-live="off">
      <div className="flex items-center gap-3">
        <SubjectDot subject={subject} size={44} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{subject?.name ?? 'Subject'}</div>
          <div className="truncate text-sm text-muted">{running.chapter}</div>
        </div>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${isPaused ? 'bg-gold/20 text-gold' : 'bg-accent-soft text-accent-strong'}`}
        >
          {isPaused ? 'Paused' : 'Studying'}
        </span>
      </div>
      <div className="text-center">
        <div
          className={`font-display text-[3.4rem] font-semibold leading-none tabular sm:text-6xl ${isPaused ? 'text-muted' : ''}`}
          role="timer"
          aria-label={`Elapsed study time ${formatDuration(ms)}`}
        >
          {formatClock(ms)}
        </div>
        <div className="mt-2 text-sm text-muted">
          Started {formatTime(running.startAt, true)}
          {paused >= 1000 ? ` - paused ${formatDurationRounded(paused)} (not counted)` : ''}
        </div>
      </div>
      {stale && (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm" role="alert">
          <p className="font-semibold">
            This session has been open for {formatDurationRounded(now - running.startAt)}.
          </p>
          <p className="mt-0.5 text-muted">
            Did you forget to finish it? Choose how to end it, or keep going.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {running.lastSeenAt > running.startAt && lastSeenGap > 10 * 60_000 && (
              <button
                className="btn btn-soft min-h-10"
                onClick={() => finish(running.lastSeenAt)}
                disabled={busy}
              >
                Finish at {formatTime(running.lastSeenAt, true)}
              </button>
            )}
            <button className="btn btn-ghost min-h-10" onClick={() => setKeepGoing(true)}>
              Keep going
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {isPaused ? (
          <button
            className="btn btn-primary min-h-14"
            onClick={() => run(() => resumeSession(running.id))}
            disabled={busy}
          >
            <Icon name="play" fill /> Resume
          </button>
        ) : (
          <button
            className="btn btn-soft min-h-14"
            onClick={() => run(() => pauseSession(running.id))}
            disabled={busy}
          >
            <Icon name="pause" /> Pause
          </button>
        )}
        <button className="btn btn-ghost min-h-14" onClick={() => finish()} disabled={busy}>
          <Icon name="stop" fill /> Finish study
        </button>
      </div>
    </div>
  );
}

export function FinishSummary({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const { sessions, pausesBySession, subjectById, dayMap, goals, todayKey, streaks } = useData();
  const toast = useToast();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const session = sessions.find((s) => s.id === sessionId);
  useEffect(() => setConfirmDiscard(false), [sessionId]);
  const open = !!sessionId && !!session && session.status === 'completed';
  if (!open || !session)
    return <Modal open={false} onClose={onClose} title="Session complete" children={null} />;

  const p = pausesBySession.get(session.id) ?? [];
  const ms = activeMs(session, p, Date.now());
  const brk = pausedMs(session, p, Date.now());
  const todayMs = dayMap.get(todayKey)?.totalMs ?? 0;
  const target = targetMsFor(goals, todayKey);
  const subject = subjectById.get(session.subjectId);

  return (
    <Modal
      open
      onClose={onClose}
      title="Session complete"
      footer={
        <>
          <button
            className="btn btn-ghost mr-auto text-danger"
            onClick={async () => {
              if (!confirmDiscard) return setConfirmDiscard(true);
              try {
                await discardSession(session.id);
                toast.show('Session discarded.');
                onClose();
              } catch (e) {
                toast.show(errorMessage(e), 'error');
              }
            }}
          >
            {confirmDiscard ? 'Tap again to discard' : 'Discard'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              try {
                await reopenSession(session.id);
                onClose();
              } catch (e) {
                toast.show(errorMessage(e), 'error');
              }
            }}
          >
            Continue studying
          </button>
          <button className="btn btn-primary" onClick={onClose} data-autofocus>
            Done
          </button>
        </>
      }
    >
      <div className="anim-pop space-y-4 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <Icon name="check" size={28} />
        </span>
        <div>
          <div className="font-display text-4xl font-semibold tabular">{formatDuration(ms)}</div>
          <div className="mt-1 text-sm text-muted">
            {subject?.name} - {session.chapter}
          </div>
          {brk >= 60_000 && (
            <div className="text-xs text-muted">
              {formatDurationRounded(brk)} of breaks were not counted.
            </div>
          )}
        </div>
        <div className="rounded-xl bg-sunken p-3 text-left">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="font-semibold">Today</span>
            <span className="tabular text-muted">
              {formatDurationRounded(todayMs)} of {formatDurationRounded(target)}
            </span>
          </div>
          <Progress value={target ? todayMs / target : 0} />
        </div>
        <p className="text-sm text-muted">
          {todayMs >= target
            ? 'Daily target reached. '
            : `${formatDurationRounded(Math.max(0, target - todayMs))} to reach today's target. `}
          {streaks.current > 0 ? `You are on a ${streaks.current}-day streak.` : ''}
        </p>
      </div>
    </Modal>
  );
}

/** Compact running-session bar shown on every page except Home. */
export function MiniTimer() {
  const { running, subjectById } = useData();
  const { ms } = useRunningElapsed();
  const nav = useNavigate();
  if (!running) return null;
  const isPaused = running.status === 'paused';
  return (
    <button
      onClick={() => nav('/')}
      className="card anim-fade flex w-full items-center gap-3 px-4 py-2.5 text-left shadow-sm"
      aria-label="Open running study session"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${isPaused ? 'bg-gold' : 'animate-pulse bg-accent'}`}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {subjectById.get(running.subjectId)?.name}
      </span>
      <span className="font-display text-lg font-semibold tabular">
        {isPaused ? 'Paused' : formatClock(ms)}
      </span>
    </button>
  );
}
