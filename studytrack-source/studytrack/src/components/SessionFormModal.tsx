import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Field } from './ui';
import { SubjectSelect } from './SubjectSelect';
import { addManualSession, updateSession } from '../db/sessions';
import { errorMessage } from '../db/errors';
import { combineDateTime, dateKey, formatDuration, hhmm, startOfDay } from '../lib/time';
import { validateTimeRange } from '../lib/validation';
import { useToast } from '../hooks/useToast';
import type { Session } from '../types';

type Mode = 'end' | 'duration';

/** Quick Add (no `session`) and Edit (with a completed `session`). */
export function SessionFormModal({
  open,
  onClose,
  session,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  session?: Session;
  defaultDate?: string;
}) {
  const toast = useToast();
  const [subjectId, setSubjectId] = useState('');
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('17:00');
  const [mode, setMode] = useState<Mode>('end');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The form is (re)initialised only when it opens or targets a different session. Live data
  // refreshes (e.g. the running timer's heartbeat) must never overwrite what the student is typing.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sessionId = session?.id;

  useEffect(() => {
    if (!open) return;
    const session = sessionRef.current;
    const now = Date.now();
    if (session && session.endAt) {
      setSubjectId(session.subjectId);
      setChapter(session.chapter);
      setTopic(session.topic);
      setNotes(session.notes);
      setDate(dateKey(session.startAt));
      setStart(hhmm(session.startAt));
      setEnd(hhmm(session.endAt));
      const mins = Math.round((session.endAt - session.startAt) / 60000);
      setHours(String(Math.floor(mins / 60)));
      setMinutes(String(mins % 60));
    } else {
      setSubjectId('');
      setChapter('');
      setTopic('');
      setNotes('');
      const d = defaultDate ?? dateKey(now);
      setDate(d);
      const isToday = d === dateKey(now);
      setStart(isToday ? hhmm(Math.max(startOfDay(now), now - 3_600_000)) : '16:00');
      setEnd(isToday ? hhmm(now) : '17:00');
      setHours('1');
      setMinutes('0');
    }
    setMode('end');
    setError('');
    setBusy(false);
  }, [open, sessionId, defaultDate]);

  const computed = useMemo(() => {
    if (!date || !start) return null;
    const startAt = combineDateTime(date, start);
    let endAt: number;
    let nextDay = false;
    if (mode === 'duration') {
      const h = Number(hours || 0);
      const m = Number(minutes || 0);
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0)
        return { startAt, endAt: NaN, nextDay };
      endAt = startAt + (h * 60 + m) * 60_000;
      nextDay = dateKey(endAt) !== date;
    } else {
      if (!end) return null;
      endAt = combineDateTime(date, end);
      if (endAt <= startAt) {
        const d = new Date(endAt);
        d.setDate(d.getDate() + 1); // finishing after midnight
        endAt = d.getTime();
        nextDay = true;
      }
    }
    return { startAt, endAt, nextDay };
  }, [date, start, end, mode, hours, minutes]);

  async function save() {
    if (busy) return;
    setError('');
    if (!subjectId) return setError('Choose a subject.');
    if (!computed) return setError('Enter a valid date and time.');
    const err = validateTimeRange(computed, Date.now());
    if (err) return setError(err);
    setBusy(true);
    try {
      const fields = {
        subjectId,
        chapter,
        topic,
        notes,
        startAt: computed.startAt,
        endAt: computed.endAt,
      };
      if (session) await updateSession(session.id, fields);
      else await addManualSession(fields);
      toast.show(session ? 'Session updated.' : 'Study session added.', 'success');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const preview =
    computed && Number.isFinite(computed.endAt) && computed.endAt > computed.startAt
      ? `${formatDuration(computed.endAt - computed.startAt)}${computed.nextDay ? ' - finishes the next day' : ''}`
      : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={session ? 'Edit session' : 'Quick add'}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {session ? 'Save changes' : 'Add session'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation(); // modals are children of other forms in the React tree
          void save();
        }}
      >
        <Field label="Subject" htmlFor="qa-subject">
          <SubjectSelect
            id="qa-subject"
            value={subjectId}
            onChange={setSubjectId}
            includeId={session?.subjectId}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chapter" htmlFor="qa-chapter">
            <input
              id="qa-chapter"
              className="field"
              value={chapter}
              maxLength={120}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="e.g. Quadratic equations"
            />
          </Field>
          <Field label="Topic (optional)" htmlFor="qa-topic">
            <input
              id="qa-topic"
              className="field"
              value={topic}
              maxLength={200}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Factorising"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" htmlFor="qa-date">
            <input
              id="qa-date"
              type="date"
              className="field"
              value={date}
              max={dateKey(Date.now())}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Start time" htmlFor="qa-start">
            <input
              id="qa-start"
              type="time"
              className="field"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
        </div>
        <div
          className="inline-flex rounded-xl bg-sunken p-1"
          role="tablist"
          aria-label="How to enter the length"
        >
          {(['end', 'duration'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${mode === m ? 'bg-card shadow-sm' : 'text-muted'}`}
            >
              {m === 'end' ? 'Finish time' : 'Duration'}
            </button>
          ))}
        </div>
        {mode === 'end' ? (
          <Field
            label="Finish time"
            htmlFor="qa-end"
            hint="If this is earlier than the start time, the session ends the next day."
          >
            <input
              id="qa-end"
              type="time"
              className="field"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Hours" htmlFor="qa-hours">
              <input
                id="qa-hours"
                type="number"
                inputMode="numeric"
                min={0}
                max={24}
                className="field"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
            <Field label="Minutes" htmlFor="qa-minutes">
              <input
                id="qa-minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                className="field"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
          </div>
        )}
        {preview && (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent-strong">
            Total: {preview}
          </p>
        )}
        <Field label="Notes (optional)" htmlFor="qa-notes">
          <textarea
            id="qa-notes"
            className="field"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
          >
            {error}
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
