import Dexie, { type EntityTable } from 'dexie';
import type { Goal, Pause, SettingRow, Session, Subject } from '../types';

/**
 * IndexedDB schema.
 *
 * Versioning: every schema change must add a NEW `db.version(n)` block below with the full
 * store definition (and an `.upgrade()` callback when existing rows need transforming).
 * Never edit a released version in place. Version 1 is the first release, so there is
 * nothing to migrate yet; the pattern is documented in the README.
 */
export class StudyTrackDB extends Dexie {
  subjects!: EntityTable<Subject, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  pauses!: EntityTable<Pause, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'studytrack') {
    super(name);
    this.version(1).stores({
      subjects: 'id, name, createdAt, archivedAt',
      sessions: 'id, subjectId, status, startAt, endAt, [subjectId+startAt]',
      pauses: 'id, sessionId, pausedAt',
      goals: 'id, effectiveFrom',
      settings: 'key',
    });
  }
}

export const db = new StudyTrackDB();

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
