import { db, newId } from './db';
import { StudyError } from './errors';
import { overlaps } from '../lib/sessionMath';
import { cleanText, validateText, validateTimeRange } from '../lib/validation';
import { formatDateShort, formatTime, dateKey } from '../lib/time';
import type { Pause, Session } from '../types';

export interface SessionFields {
  subjectId: string;
  chapter: string;
  topic?: string;
  notes?: string;
}

async function requireSubject(id: string, allowArchived = false) {
  const s = await db.subjects.get(id);
  if (!s || (!allowArchived && s.archivedAt)) {
    throw new StudyError('NOT_FOUND', 'Choose a subject first. This one is no longer available.');
  }
  return s;
}

export async function getRunningSession(): Promise<Session | undefined> {
  return db.sessions.where('status').anyOf('active', 'paused').first();
}

/**
 * Starts the one-and-only running session. The check and the insert happen inside a single
 * IndexedDB transaction, which the browser serialises across ALL tabs, so two tabs (or a
 * double click) can never create two running sessions.
 */
export async function startSession(fields: SessionFields, now = Date.now()): Promise<Session> {
  const textErr = validateText(fields);
  if (textErr) throw new StudyError('INVALID', textErr);
  return db.transaction('rw', db.sessions, db.subjects, async () => {
    if (await getRunningSession()) {
      throw new StudyError('ACTIVE_EXISTS', 'A study session is already running.');
    }
    await requireSubject(fields.subjectId);
    const session: Session = {
      id: newId(),
      subjectId: fields.subjectId,
      chapter: cleanText(fields.chapter, 120),
      topic: cleanText(fields.topic, 200),
      notes: (fields.notes ?? '').trim().slice(0, 2000),
      startAt: now,
      endAt: null,
      status: 'active',
      source: 'timer',
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    await db.sessions.add(session);
    return session;
  });
}

/** Idempotent: pausing an already-paused or finished session does nothing. */
export async function pauseSession(id: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, db.pauses, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'active') return;
    const pausedAt = Math.max(now, s.startAt);
    await db.pauses.add({ id: newId(), sessionId: id, pausedAt, resumedAt: null });
    await db.sessions.update(id, { status: 'paused', updatedAt: now, lastSeenAt: now });
  });
}

export async function resumeSession(id: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, db.pauses, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'paused') return;
    const open = await db.pauses
      .where('sessionId')
      .equals(id)
      .filter((p) => p.resumedAt === null)
      .toArray();
    for (const p of open) {
      await db.pauses.update(p.id, { resumedAt: Math.max(now, p.pausedAt) });
    }
    await db.sessions.update(id, { status: 'active', updatedAt: now, lastSeenAt: now });
  });
}

/**
 * Finishes a running session. `at` may be earlier than now (e.g. "finish at the last time
 * I was in the app") but never earlier than the start or the last pause start.
 */
export async function finishSession(id: string, at = Date.now()): Promise<Session | undefined> {
  return db.transaction('rw', db.sessions, db.pauses, async () => {
    const s = await db.sessions.get(id);
    if (!s) return undefined;
    if (s.status === 'completed') return s; // double click / second tab: already done
    const pauses = await db.pauses.where('sessionId').equals(id).toArray();
    const lastPauseStart = pauses.reduce((m, p) => Math.max(m, p.pausedAt), s.startAt);
    const endAt = Math.max(at, s.startAt, s.status === 'paused' ? lastPauseStart : s.startAt);
    for (const p of pauses) {
      if (p.resumedAt === null)
        await db.pauses.update(p.id, { resumedAt: Math.max(endAt, p.pausedAt) });
    }
    await db.sessions.update(id, { status: 'completed', endAt, updatedAt: Date.now() });
    return db.sessions.get(id);
  });
}

export async function discardSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.pauses, async () => {
    await db.pauses.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

export async function heartbeat(id: string, now = Date.now()): Promise<void> {
  await db.sessions
    .where('id')
    .equals(id)
    .modify((s) => {
      if (s.status !== 'completed') s.lastSeenAt = now;
    });
}

async function findOverlap(startAt: number, endAt: number, exceptId?: string, now = Date.now()) {
  const candidates = await db.sessions
    .where('startAt')
    .below(endAt)
    .filter((s) => s.id !== exceptId && overlaps(startAt, endAt, s.startAt, s.endAt ?? now))
    .toArray();
  return candidates[0];
}

async function overlapError(other: Session, startAt: number, endAt: number): Promise<StudyError> {
  const subject = await db.subjects.get(other.subjectId);
  const oEnd = other.endAt ?? Date.now();
  const same = other.startAt === startAt && oEnd === endAt;
  const label = `${subject?.name ?? 'Subject'} - ${other.chapter}`;
  const when = `${formatDateShort(dateKey(other.startAt))}, ${formatTime(other.startAt, true)} to ${formatTime(oEnd, true)}`;
  return new StudyError(
    'OVERLAP',
    same
      ? `This session is already logged (${label}, ${when}).`
      : `This overlaps another session (${label}, ${when}). Adjust the times so study time is not counted twice.`,
  );
}

export interface ManualSessionInput extends SessionFields {
  startAt: number;
  endAt: number;
}

export async function addManualSession(
  input: ManualSessionInput,
  now = Date.now(),
): Promise<Session> {
  const textErr = validateText(input);
  if (textErr) throw new StudyError('INVALID', textErr);
  const timeErr = validateTimeRange(input, now);
  if (timeErr) throw new StudyError('INVALID', timeErr);
  return db.transaction('rw', db.sessions, db.subjects, async () => {
    await requireSubject(input.subjectId);
    const clash = await findOverlap(input.startAt, input.endAt, undefined, now);
    if (clash) throw await overlapError(clash, input.startAt, input.endAt);
    const session: Session = {
      id: newId(),
      subjectId: input.subjectId,
      chapter: cleanText(input.chapter, 120),
      topic: cleanText(input.topic, 200),
      notes: (input.notes ?? '').trim().slice(0, 2000),
      startAt: input.startAt,
      endAt: input.endAt,
      status: 'completed',
      source: 'manual',
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    await db.sessions.add(session);
    return session;
  });
}

export interface SessionEdit extends SessionFields {
  startAt: number;
  endAt: number;
}

/** Edits a COMPLETED session. Pause intervals are clipped to the new time range. */
export async function updateSession(
  id: string,
  edit: SessionEdit,
  now = Date.now(),
): Promise<void> {
  const textErr = validateText(edit);
  if (textErr) throw new StudyError('INVALID', textErr);
  const timeErr = validateTimeRange(edit, now);
  if (timeErr) throw new StudyError('INVALID', timeErr);
  await db.transaction('rw', db.sessions, db.subjects, db.pauses, async () => {
    const s = await db.sessions.get(id);
    if (!s) throw new StudyError('NOT_FOUND', 'This session no longer exists.');
    if (s.status !== 'completed') {
      throw new StudyError('INVALID', 'Finish the running session before editing it.');
    }
    await requireSubject(edit.subjectId, edit.subjectId === s.subjectId);
    const clash = await findOverlap(edit.startAt, edit.endAt, id, now);
    if (clash) throw await overlapError(clash, edit.startAt, edit.endAt);

    const pauses = await db.pauses.where('sessionId').equals(id).toArray();
    for (const p of pauses) {
      const ps = Math.max(p.pausedAt, edit.startAt);
      const pe = Math.min(p.resumedAt ?? edit.endAt, edit.endAt);
      if (pe <= ps) await db.pauses.delete(p.id);
      else await db.pauses.update(p.id, { pausedAt: ps, resumedAt: pe });
    }
    await db.sessions.update(id, {
      subjectId: edit.subjectId,
      chapter: cleanText(edit.chapter, 120),
      topic: cleanText(edit.topic, 200),
      notes: (edit.notes ?? '').trim().slice(0, 2000),
      startAt: edit.startAt,
      endAt: edit.endAt,
      updatedAt: now,
    });
  });
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.pauses, async () => {
    const s = await db.sessions.get(id);
    if (s && s.status !== 'completed') {
      throw new StudyError('INVALID', 'Finish the running session before deleting it.');
    }
    await db.pauses.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

export async function pausesFor(id: string): Promise<Pause[]> {
  return db.pauses.where('sessionId').equals(id).sortBy('pausedAt');
}

/**
 * "Continue studying" right after finishing by mistake: the gap between finish and now is
 * recorded as a pause, so it never counts as study time.
 */
export async function reopenSession(id: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, db.pauses, async () => {
    if (await getRunningSession()) {
      throw new StudyError('ACTIVE_EXISTS', 'Another study session is already running.');
    }
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'completed' || s.endAt === null) {
      throw new StudyError('NOT_FOUND', 'That session cannot be continued.');
    }
    if (now > s.endAt) {
      await db.pauses.add({ id: newId(), sessionId: id, pausedAt: s.endAt, resumedAt: now });
    }
    await db.sessions.update(id, {
      status: 'active',
      endAt: null,
      updatedAt: now,
      lastSeenAt: now,
    });
  });
}
