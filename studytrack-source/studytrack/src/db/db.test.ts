import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  createSubject,
  archiveSubject,
  deleteSubjectAndSessions,
  restoreSubject,
} from './subjects';
import {
  addManualSession,
  deleteSession,
  discardSession,
  finishSession,
  getRunningSession,
  pauseSession,
  reopenSession,
  resumeSession,
  startSession,
  updateSession,
} from './sessions';
import { setDailyTarget, loadSettings, saveSetting } from './settings';
import { exportBackup, parseBackup, restoreBackup } from './backup';
import { activeMs } from '../lib/sessionMath';
import { StudyError } from './errors';

const MIN = 60_000;
const at = (d: number, hh: number, mm = 0) => new Date(2026, 10, d, hh, mm).getTime();
const NOW = at(15, 12);

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

async function subject(name = 'Maths') {
  return createSubject(name, 'forest', 'calc');
}
const fields = (subjectId: string, chapter = 'Algebra') => ({ subjectId, chapter });
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(StudyError);
  await p.catch((e: StudyError) => expect(e.code).toBe(code));
};

describe('subjects', () => {
  it('creates, trims and rejects duplicate names (case-insensitive)', async () => {
    const s = await createSubject('  Maths  ', 'forest', 'calc');
    expect(s.name).toBe('Maths');
    await expectCode(createSubject('maths', 'sage', 'book'), 'DUPLICATE_NAME');
    await expectCode(createSubject('   ', 'sage', 'book'), 'INVALID');
  });
  it('archives (keeps history), restores, and blocks removal during a running session', async () => {
    const s = await subject();
    await addManualSession({ ...fields(s.id), startAt: at(14, 10), endAt: at(14, 11) }, NOW);
    await archiveSubject(s.id);
    expect((await db.subjects.get(s.id))?.archivedAt).toBeTruthy();
    expect(await db.sessions.count()).toBe(1);
    await restoreSubject(s.id);
    expect((await db.subjects.get(s.id))?.archivedAt).toBeNull();
    await startSession(fields(s.id), NOW);
    await expectCode(archiveSubject(s.id), 'SUBJECT_IN_USE');
    await expectCode(deleteSubjectAndSessions(s.id), 'SUBJECT_IN_USE');
    expect(await db.subjects.count()).toBe(1);
  });
  it('deletes a subject with its sessions and pauses, leaving other subjects alone', async () => {
    const a = await subject('A');
    const b = await subject('B');
    const s = await startSession(fields(a.id), at(14, 10));
    await pauseSession(s.id, at(14, 10, 20));
    await resumeSession(s.id, at(14, 10, 30));
    await finishSession(s.id, at(14, 11));
    await addManualSession({ ...fields(b.id), startAt: at(13, 10), endAt: at(13, 11) }, NOW);
    expect(await deleteSubjectAndSessions(a.id)).toBe(1);
    expect(await db.pauses.count()).toBe(0);
    expect(await db.sessions.count()).toBe(1);
    expect((await db.sessions.toArray())[0].subjectId).toBe(b.id);
  });
});

describe('timer sessions', () => {
  it('starts, pauses, resumes and finishes with exact durations', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10, 0));
    expect(s.status).toBe('active');
    await pauseSession(s.id, at(14, 10, 20));
    await resumeSession(s.id, at(14, 10, 35));
    const done = await finishSession(s.id, at(14, 11, 0));
    const pauses = await db.pauses.toArray();
    expect(done?.status).toBe('completed');
    expect(activeMs(done!, pauses, NOW)).toBe(45 * MIN);
  });
  it('allows only ONE running session, even for simultaneous starts (two tabs / double click)', async () => {
    const sub = await subject();
    const results = await Promise.allSettled([
      startSession(fields(sub.id), NOW),
      startSession(fields(sub.id), NOW),
      startSession(fields(sub.id, 'Other'), NOW),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.sessions.count()).toBe(1);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect(((r as PromiseRejectedResult).reason as StudyError).code).toBe('ACTIVE_EXISTS');
    }
  });
  it('makes pause/resume/finish idempotent (repeated clicks, second tab)', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10));
    await Promise.all([
      pauseSession(s.id, at(14, 10, 10)),
      pauseSession(s.id, at(14, 10, 10)),
      pauseSession(s.id, at(14, 10, 11)),
    ]);
    expect(await db.pauses.count()).toBe(1);
    await Promise.all([resumeSession(s.id, at(14, 10, 20)), resumeSession(s.id, at(14, 10, 21))]);
    expect((await db.pauses.toArray())[0].resumedAt).not.toBeNull();
    const [a, b] = await Promise.all([
      finishSession(s.id, at(14, 11)),
      finishSession(s.id, at(14, 11, 5)),
    ]);
    expect(a?.endAt).toBe(b?.endAt);
    expect((await db.sessions.get(s.id))?.endAt).toBe(at(14, 11));
  });
  it('finishing while paused does not count the pause', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10));
    await pauseSession(s.id, at(14, 10, 30));
    const done = await finishSession(s.id, at(14, 12));
    expect(activeMs(done!, await db.pauses.toArray(), NOW)).toBe(30 * MIN);
  });
  it('recovers an unfinished session after the browser is closed and reopened', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10));
    await pauseSession(s.id, at(14, 10, 15));
    db.close(); // browser closed
    await db.open(); // browser reopened
    const running = await getRunningSession();
    expect(running?.id).toBe(s.id);
    expect(running?.status).toBe('paused');
    // Hours later the elapsed time is still exactly what was studied before the pause.
    expect(activeMs(running!, await db.pauses.toArray(), at(14, 18))).toBe(15 * MIN);
  });
  it('finishes at an earlier time, but never before the start', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10));
    const done = await finishSession(s.id, at(14, 9)); // bad input
    expect(done?.endAt).toBe(at(14, 10));
    expect(activeMs(done!, [], NOW)).toBe(0);
  });
  it('requires a chapter and an existing, non-archived subject', async () => {
    const sub = await subject();
    await expectCode(startSession({ subjectId: sub.id, chapter: '  ' }, NOW), 'INVALID');
    await expectCode(startSession({ subjectId: 'missing', chapter: 'x' }, NOW), 'NOT_FOUND');
    await archiveSubject(sub.id);
    await expectCode(startSession(fields(sub.id), NOW), 'NOT_FOUND');
    expect(await db.sessions.count()).toBe(0);
  });
  it('continue-studying after finishing records the gap as a pause', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10));
    await finishSession(s.id, at(14, 10, 30));
    await reopenSession(s.id, at(14, 10, 40));
    const re = await db.sessions.get(s.id);
    expect(re?.status).toBe('active');
    expect(activeMs(re!, await db.pauses.toArray(), at(14, 10, 50))).toBe(40 * MIN); // 30 + 10, gap excluded
  });
  it('discards a session with its pauses', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10));
    await pauseSession(s.id, at(14, 10, 5));
    await discardSession(s.id);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.pauses.count()).toBe(0);
  });
});

describe('manual sessions: create, edit, delete', () => {
  it('adds a session, including one that crosses midnight', async () => {
    const sub = await subject();
    const s = await addManualSession(
      { ...fields(sub.id), startAt: at(13, 23, 0), endAt: at(14, 1, 0) },
      NOW,
    );
    expect(activeMs(s, [], NOW)).toBe(120 * MIN);
    expect(s.source).toBe('manual');
  });
  it('rejects invalid input and writes nothing', async () => {
    const sub = await subject();
    await expectCode(
      addManualSession({ ...fields(sub.id), startAt: at(14, 11), endAt: at(14, 10) }, NOW),
      'INVALID',
    );
    await expectCode(
      addManualSession({ ...fields(sub.id), startAt: at(16, 10), endAt: at(16, 11) }, NOW),
      'INVALID',
    );
    await expectCode(
      addManualSession({ ...fields(sub.id, ''), startAt: at(14, 10), endAt: at(14, 11) }, NOW),
      'INVALID',
    );
    await expectCode(
      addManualSession({ ...fields('nope'), startAt: at(14, 10), endAt: at(14, 11) }, NOW),
      'NOT_FOUND',
    );
    expect(await db.sessions.count()).toBe(0);
  });
  it('prevents exact duplicates and overlaps, but allows back-to-back sessions', async () => {
    const sub = await subject();
    const base = { ...fields(sub.id), startAt: at(14, 10), endAt: at(14, 11) };
    await addManualSession(base, NOW);
    await expectCode(addManualSession(base, NOW), 'OVERLAP');
    await expectCode(
      addManualSession({ ...base, startAt: at(14, 10, 30), endAt: at(14, 11, 30) }, NOW),
      'OVERLAP',
    );
    await addManualSession({ ...base, startAt: at(14, 11), endAt: at(14, 12) }, NOW);
    expect(await db.sessions.count()).toBe(2);
  });
  it('does not allow a manual entry that overlaps the running session', async () => {
    const sub = await subject();
    await startSession(fields(sub.id), at(15, 11));
    await expectCode(
      addManualSession({ ...fields(sub.id), startAt: at(15, 11, 10), endAt: at(15, 11, 40) }, NOW),
      'OVERLAP',
    );
  });
  it('edits details and times, clipping pause intervals to the new range', async () => {
    const sub = await subject();
    const other = await subject('Science');
    const s = await startSession(fields(sub.id), at(14, 10));
    await pauseSession(s.id, at(14, 10, 40));
    await resumeSession(s.id, at(14, 10, 50));
    await finishSession(s.id, at(14, 11));
    await updateSession(
      s.id,
      {
        subjectId: other.id,
        chapter: 'Cells',
        topic: 'Mitosis',
        notes: 'n',
        startAt: at(14, 10, 45),
        endAt: at(14, 11, 30),
      },
      NOW,
    );
    const e = (await db.sessions.get(s.id))!;
    expect(e.subjectId).toBe(other.id);
    expect(e.chapter).toBe('Cells');
    const pauses = await db.pauses.toArray();
    expect(pauses[0].pausedAt).toBe(at(14, 10, 45)); // clipped
    expect(activeMs(e, pauses, NOW)).toBe(45 * MIN - 5 * MIN);
  });
  it('a failed edit leaves the original untouched (rollback)', async () => {
    const sub = await subject();
    const a = await addManualSession(
      { ...fields(sub.id), startAt: at(14, 10), endAt: at(14, 11) },
      NOW,
    );
    await addManualSession({ ...fields(sub.id, 'B'), startAt: at(14, 12), endAt: at(14, 13) }, NOW);
    await expectCode(
      updateSession(a.id, { ...fields(sub.id), startAt: at(14, 10), endAt: at(14, 12, 30) }, NOW),
      'OVERLAP',
    );
    expect((await db.sessions.get(a.id))?.endAt).toBe(at(14, 11));
  });
  it('deletes a session and its pauses, but refuses to delete a running one', async () => {
    const sub = await subject();
    const s = await startSession(fields(sub.id), at(14, 10));
    await expectCode(deleteSession(s.id), 'INVALID');
    await pauseSession(s.id, at(14, 10, 10));
    await finishSession(s.id, at(14, 10, 30));
    await deleteSession(s.id);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.pauses.count()).toBe(0);
  });
});

describe('settings, goals and persistence', () => {
  it('stores settings with defaults and a goal history', async () => {
    expect((await loadSettings()).theme).toBe('system');
    await saveSetting('hour12', false);
    expect((await loadSettings()).hour12).toBe(false);
    await setDailyTarget(90, '2026-11-01');
    await setDailyTarget(150, '2026-11-10');
    await setDailyTarget(160, '2026-11-10'); // same day updates, no duplicate row
    expect(await db.goals.count()).toBe(2);
    await expect(setDailyTarget(1)).rejects.toThrow();
  });
  it('keeps data across closing and reopening the database', async () => {
    const sub = await subject();
    await addManualSession({ ...fields(sub.id), startAt: at(14, 10), endAt: at(14, 11) }, NOW);
    db.close();
    await db.open();
    expect(db.verno).toBe(1);
    expect(await db.sessions.count()).toBe(1);
    expect(await db.subjects.count()).toBe(1);
  });
});

describe('backup and restore', () => {
  it('round-trips all data and rejects damaged files without changing anything', async () => {
    const sub = await subject();
    await addManualSession({ ...fields(sub.id), startAt: at(14, 10), endAt: at(14, 11) }, NOW);
    await setDailyTarget(75, '2026-11-01');
    const backup = await exportBackup();
    await db.sessions.clear();
    await db.subjects.clear();
    await restoreBackup(parseBackup(JSON.stringify(backup)));
    expect(await db.sessions.count()).toBe(1);
    expect(await db.subjects.count()).toBe(1);
    expect(() => parseBackup('not json')).toThrow(StudyError);
    expect(() => parseBackup(JSON.stringify({ ...backup, sessions: [{ id: 'x' }] }))).toThrow(
      StudyError,
    );
    expect(() => parseBackup(JSON.stringify({ ...backup, app: 'other' }))).toThrow(StudyError);
    expect(await db.sessions.count()).toBe(1);
  });
});
