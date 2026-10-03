export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;
export const INVALID_FILE_MESSAGE = 'Only PDF format files under 25MB are allowed.';
export const TOO_MANY_FILES_MESSAGE = 'You can attach at most 10 files at a time.';

export interface FileCheck {
  accepted: File[];
  /** Set when at least one file was refused; shown next to the drop zone. */
  error: string | null;
}

/**
 * Client-side pre-check (the server re-checks the real file content):
 * .pdf extension, at most 25 MB, no duplicates, at most 10 files in total.
 */
export function checkPdfFiles(incoming: File[], existing: File[] = []): FileCheck {
  const accepted: File[] = [];
  let error: string | null = null;
  for (const file of incoming) {
    const isPdf = /\.pdf$/i.test(file.name);
    if (!isPdf || file.size > MAX_PDF_BYTES || file.size === 0) {
      error = INVALID_FILE_MESSAGE;
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
