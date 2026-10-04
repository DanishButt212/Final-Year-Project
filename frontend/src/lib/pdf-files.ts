/** Default until /settings/public answers; the administrator can change it (UC-2.3). */
export const DEFAULT_MAX_MB = 25;
export const MAX_PDF_BYTES = DEFAULT_MAX_MB * 1024 * 1024;
export const MAX_FILES = 10;
export const invalidFileMessage = (maxMb: number) =>
  `Only PDF format files under ${maxMb}MB are allowed.`;
export const INVALID_FILE_MESSAGE = invalidFileMessage(DEFAULT_MAX_MB);
export const TOO_MANY_FILES_MESSAGE = 'You can attach at most 10 files at a time.';

export interface FileCheck {
  accepted: File[];
  /** Set when at least one file was refused; shown next to the drop zone. */
  error: string | null;
}

/**
 * Client-side pre-check (the server re-checks the real file content):
 * .pdf extension, at most the active size limit, no duplicates, at most 10 files in total.
 */
export function checkPdfFiles(
  incoming: File[],
  existing: File[] = [],
  maxMb: number = DEFAULT_MAX_MB,
): FileCheck {
  const accepted: File[] = [];
  let error: string | null = null;
  for (const file of incoming) {
    const isPdf = /\.pdf$/i.test(file.name);
    if (!isPdf || file.size > maxMb * 1024 * 1024 || file.size === 0) {
      error = invalidFileMessage(maxMb);
      continue;
    }
    const duplicate = [...existing, ...accepted].some(
      (f) => f.name === file.name && f.size === file.size,
    );
    if (duplicate) continue;
    if (existing.length + accepted.length >= MAX_FILES) {
      error = error ?? TOO_MANY_FILES_MESSAGE;
      continue;
    }
    accepted.push(file);
  }
  return { accepted, error };
}
