import { db, newId } from './db';
import { DEFAULT_SETTINGS, type Settings } from '../types';
import { dateKey } from '../lib/time';

export async function loadSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out as unknown as Settings;
}

export async function saveSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await db.settings.put({ key, value });
  if (key === 'theme') {
    try {
      localStorage.setItem('studytrack.theme', String(value));
    } catch {
      /* storage may be blocked; the DB value still applies after load */
    }
  }
}

/**
 * Sets the daily target from `fromKey` onwards. Earlier days keep the target that applied
 * then, so changing your goal never rewrites your history.
 */
export async function setDailyTarget(
  minutes: number,
  fromKey = dateKey(Date.now()),
): Promise<void> {
  const m = Math.round(minutes);
  if (!Number.isFinite(m) || m < 5 || m > 1440)
    throw new Error('Target must be 5 to 1440 minutes.');
  await db.transaction('rw', db.goals, async () => {
    const existing = await db.goals.where('effectiveFrom').equals(fromKey).first();
    if (existing) await db.goals.update(existing.id, { targetMinutes: m });
    else await db.goals.add({ id: newId(), effectiveFrom: fromKey, targetMinutes: m });
  });
}
