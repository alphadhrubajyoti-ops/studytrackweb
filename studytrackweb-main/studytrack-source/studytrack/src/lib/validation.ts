export const MAX_SESSION_MS = 24 * 3_600_000;
export const MIN_SESSION_MS = 60_000;
const FUTURE_TOLERANCE_MS = 60_000;

export interface TimeRangeInput {
  startAt: number;
  endAt: number;
}

/** Returns a user-facing error message, or null when the range is valid. */
export function validateTimeRange({ startAt, endAt }: TimeRangeInput, now: number): string | null {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return 'Enter a valid date and time.';
  if (endAt <= startAt) return 'The finish time must be after the start time.';
  if (endAt - startAt < MIN_SESSION_MS) return 'A session must be at least 1 minute long.';
  if (endAt - startAt > MAX_SESSION_MS) return 'A single session cannot be longer than 24 hours.';
  if (startAt > now + FUTURE_TOLERANCE_MS || endAt > now + FUTURE_TOLERANCE_MS) {
    return 'You cannot log study time in the future.';
  }
  return null;
}

export interface TextFields {
  chapter: string;
  topic?: string;
  notes?: string;
}

export function cleanText(v: string | undefined, max: number): string {
  return (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validateText(f: TextFields): string | null {
  if (!cleanText(f.chapter, 120)) return 'Add a chapter so you can find this session later.';
  if ((f.topic ?? '').length > 200) return 'Topic is too long (200 characters maximum).';
  if ((f.notes ?? '').length > 2000) return 'Notes are too long (2000 characters maximum).';
  return null;
}

export function validateSubjectName(name: string): string | null {
  const n = cleanText(name, 60);
  if (!n) return 'Give the subject a name.';
  if (name.trim().length > 60) return 'Subject names can be up to 60 characters.';
  return null;
}
