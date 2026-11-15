import { db, newId } from './db';
import { StudyError } from './errors';
import { cleanText, validateSubjectName } from '../lib/validation';
import type { Subject } from '../types';

async function assertNameFree(name: string, exceptId?: string) {
  const lower = name.toLowerCase();
  const all = await db.subjects.toArray();
  if (all.some((s) => s.id !== exceptId && !s.archivedAt && s.name.toLowerCase() === lower)) {
    throw new StudyError('DUPLICATE_NAME', `You already have a subject called "${name}".`);
  }
}

export async function createSubject(name: string, color: string, icon: string): Promise<Subject> {
  const err = validateSubjectName(name);
  if (err) throw new StudyError('INVALID', err);
  const clean = cleanText(name, 60);
  return db.transaction('rw', db.subjects, async () => {
    await assertNameFree(clean);
    const subject: Subject = {
      id: newId(),
      name: clean,
      color,
      icon,
      createdAt: Date.now(),
      archivedAt: null,
    };
    await db.subjects.add(subject);
    return subject;
  });
}

export async function updateSubject(
  id: string,
  patch: Partial<Pick<Subject, 'name' | 'color' | 'icon'>>,
): Promise<void> {
  await db.transaction('rw', db.subjects, async () => {
    const s = await db.subjects.get(id);
    if (!s) throw new StudyError('NOT_FOUND', 'That subject no longer exists.');
    const next = { ...patch };
    if (patch.name !== undefined) {
      const err = validateSubjectName(patch.name);
      if (err) throw new StudyError('INVALID', err);
      next.name = cleanText(patch.name, 60);
      await assertNameFree(next.name, id);
    }
    await db.subjects.update(id, next);
  });
}

export async function archiveSubject(id: string): Promise<void> {
  await db.transaction('rw', db.subjects, db.sessions, async () => {
    const running = await db.sessions
      .where('status')
      .anyOf('active', 'paused')
      .filter((s) => s.subjectId === id)
      .count();
    if (running > 0) {
      throw new StudyError(
        'SUBJECT_IN_USE',
        'Finish your running session before removing this subject.',
      );
    }
    await db.subjects.update(id, { archivedAt: Date.now() });
  });
}

export async function restoreSubject(id: string): Promise<void> {
  await db.transaction('rw', db.subjects, async () => {
    const s = await db.subjects.get(id);
    if (!s) throw new StudyError('NOT_FOUND', 'That subject no longer exists.');
    await assertNameFree(s.name, id);
    await db.subjects.update(id, { archivedAt: null });
  });
}

/** Permanently deletes a subject AND every session that belongs to it. */
export async function deleteSubjectAndSessions(id: string): Promise<number> {
  return db.transaction('rw', db.subjects, db.sessions, db.pauses, async () => {
    const sessions = await db.sessions.where('subjectId').equals(id).toArray();
    if (sessions.some((s) => s.status !== 'completed')) {
      throw new StudyError(
        'SUBJECT_IN_USE',
        'Finish your running session before deleting this subject.',
      );
    }
    const ids = sessions.map((s) => s.id);
    await db.pauses.where('sessionId').anyOf(ids).delete();
    await db.sessions.bulkDelete(ids);
    await db.subjects.delete(id);
    return ids.length;
  });
}

export async function sessionCountForSubject(id: string): Promise<number> {
  return db.sessions.where('subjectId').equals(id).count();
}
