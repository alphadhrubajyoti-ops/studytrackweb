export type SessionStatus = 'active' | 'paused' | 'completed';
export type SessionSource = 'timer' | 'manual';

export interface Subject {
  id: string;
  name: string;
  color: string; // key into SUBJECT_COLORS
  icon: string; // key into SUBJECT_ICONS
  createdAt: number;
  archivedAt: number | null;
}

export interface Session {
  id: string;
  subjectId: string;
  chapter: string;
  topic: string;
  notes: string;
  startAt: number; // epoch ms
  endAt: number | null; // epoch ms, null while active/paused
  status: SessionStatus;
  source: SessionSource;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number; // heartbeat written while the app is visible (crash recovery hint)
}

export interface Pause {
  id: string;
  sessionId: string;
  pausedAt: number;
  resumedAt: number | null;
}

/** Daily-target history: a goal applies to every day from `effectiveFrom` until the next goal. */
export interface Goal {
  id: string;
  effectiveFrom: string; // local date key YYYY-MM-DD
  targetMinutes: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type WeekStart = 0 | 1 | 6;

export interface LockSettings {
  salt: string;
  hash: string;
}

export interface Settings {
  onboarded: boolean;
  theme: ThemeMode;
  accent: string;
  hour12: boolean;
  weekStart: WeekStart;
  reminderEnabled: boolean;
  reminderTimes: string[]; // 'HH:MM'
  lock: LockSettings | null;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  theme: 'system',
  accent: 'sage',
  hour12: true,
  weekStart: 1,
  reminderEnabled: false,
  reminderTimes: ['18:00'],
  lock: null,
};

export const DEFAULT_TARGET_MINUTES = 120;
