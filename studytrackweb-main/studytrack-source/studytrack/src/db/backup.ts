import { db } from './db';
import { StudyError } from './errors';
import type { Goal, Pause, SettingRow, Session, Subject } from '../types';

export interface BackupFile {
  app: 'studytrack';
  version: 1;
  exportedAt: number;
  subjects: Subject[];
  sessions: Session[];
  pauses: Pause[];
  goals: Goal[];
  settings: SettingRow[];
}

export async function exportBackup(): Promise<BackupFile> {
  const [subjects, sessions, pauses, goals, settings] = await Promise.all([
    db.subjects.toArray(),
    db.sessions.toArray(),
    db.pauses.toArray(),
    db.goals.toArray(),
    db.settings.toArray(),
  ]);
  // The PIN hash is deliberately left out of backups.
  return {
    app: 'studytrack',
    version: 1,
    exportedAt: Date.now(),
    subjects,
    sessions,
    pauses,
    goals,
    settings: settings.filter((s) => s.key !== 'lock'),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new StudyError('INVALID', 'That file is not a valid StudyTrack backup.');
  }
  if (!isObj(raw) || raw.app !== 'studytrack' || raw.version !== 1) {
    throw new StudyError('INVALID', 'That file is not a StudyTrack backup.');
  }
  const arr = (k: string) => {
    const v = raw[k];
    if (!Array.isArray(v)) throw new StudyError('INVALID', `The backup is missing "${k}".`);
    return v;
  };
  const subjects = arr('subjects') as Subject[];
  const sessions = arr('sessions') as Session[];
  const pauses = arr('pauses') as Pause[];
  const goals = arr('goals') as Goal[];
  const settings = arr('settings') as SettingRow[];
  const subjectIds = new Set<string>();
  for (const s of subjects) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.name !== 'string') {
      throw new StudyError('INVALID', 'The backup has a damaged subject.');
    }
    subjectIds.add(s.id);
  }
  const sessionIds = new Set<string>();
  for (const s of sessions) {
    const ok =
      isObj(s) &&
      typeof s.id === 'string' &&
      typeof s.subjectId === 'string' &&
      subjectIds.has(s.subjectId) &&
      Number.isFinite(s.startAt) &&
      (s.endAt === null || Number.isFinite(s.endAt)) &&
      ['active', 'paused', 'completed'].includes(s.status);
    if (!ok) throw new StudyError('INVALID', 'The backup has a damaged session.');
    sessionIds.add(s.id);
  }
  for (const p of pauses) {
    if (
      !isObj(p) ||
      typeof p.id !== 'string' ||
      !sessionIds.has(p.sessionId) ||
      !Number.isFinite(p.pausedAt)
    ) {
      throw new StudyError('INVALID', 'The backup has a damaged pause record.');
    }
  }
  for (const g of goals) {
    if (
      !isObj(g) ||
      typeof g.id !== 'string' ||
      typeof g.effectiveFrom !== 'string' ||
      !Number.isFinite(g.targetMinutes)
    ) {
      throw new StudyError('INVALID', 'The backup has a damaged goal.');
    }
  }
  if (sessions.filter((s) => s.status !== 'completed').length > 1) {
    throw new StudyError('INVALID', 'The backup contains more than one running session.');
  }
  return {
    app: 'studytrack',
    version: 1,
    exportedAt: Number(raw.exportedAt) || 0,
    subjects,
    sessions,
    pauses,
    goals,
    settings,
  };
}

/** Replaces ALL current data with the backup, atomically (all or nothing). */
export async function restoreBackup(b: BackupFile): Promise<void> {
  await db.transaction(
    'rw',
    [db.subjects, db.sessions, db.pauses, db.goals, db.settings],
    async () => {
      const keepLock = await db.settings.get('lock');
      await Promise.all([
        db.subjects.clear(),
        db.sessions.clear(),
        db.pauses.clear(),
        db.goals.clear(),
        db.settings.clear(),
      ]);
      await db.subjects.bulkAdd(b.subjects);
      await db.sessions.bulkAdd(b.sessions);
      await db.pauses.bulkAdd(b.pauses);
      await db.goals.bulkAdd(b.goals);
      await db.settings.bulkAdd(b.settings.filter((s) => s.key !== 'lock'));
      if (keepLock) await db.settings.put(keepLock);
    },
  );
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.subjects, db.sessions, db.pauses, db.goals, db.settings],
    async () => {
      await Promise.all([
        db.subjects.clear(),
        db.sessions.clear(),
        db.pauses.clear(),
        db.goals.clear(),
        db.settings.clear(),
      ]);
    },
  );
  try {
    localStorage.removeItem('studytrack.theme');
  } catch {
    /* ignore */
  }
}
