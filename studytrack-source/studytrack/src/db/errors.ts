export type StudyErrorCode =
  'ACTIVE_EXISTS' | 'NOT_FOUND' | 'INVALID' | 'OVERLAP' | 'DUPLICATE_NAME' | 'SUBJECT_IN_USE';

/** Errors whose message is safe to show directly to the student. */
export class StudyError extends Error {
  code: StudyErrorCode;
  constructor(code: StudyErrorCode, message: string) {
    super(message);
    this.name = 'StudyError';
    this.code = code;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof StudyError) return e.message;
  if (e instanceof Error) {
    if (e.name === 'QuotaExceededError') {
      return 'Your browser storage is full. Free some space on this device and try again.';
    }
    if (e.name === 'InvalidStateError' || e.name === 'UnknownError') {
      return 'The browser database is unavailable (private browsing or blocked storage?). Nothing was saved.';
    }
    return 'Something went wrong and nothing was changed. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}
