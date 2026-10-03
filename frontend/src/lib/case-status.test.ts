import { describe, expect, it } from 'vitest';
import {
  caseTypeLabel,
  judgeBench,
  STATUS_BADGES,
  statusBadge,
  type CaseStatus,
} from './case-status';
import { formatDate, formatDateTime, formatFileSize } from './format';
import {
  checkPdfFiles,
  INVALID_FILE_MESSAGE,
  MAX_PDF_BYTES,
  TOO_MANY_FILES_MESSAGE,
} from './pdf-files';

const file = (name: string, size = 1000) => {
  const f = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('status badge mapping (MASTER.md tokens)', () => {
  it.each<[CaseStatus, string, string]>([
    ['DECIDED', 'decided', 'Decided'],
    ['PENDING_ASSIGNMENT', 'pending', 'Pending Assignment'],
    ['PENDING', 'pending', 'Pending'],
    ['FILED', 'pending', 'Filed'],
    ['UNDER_SCRUTINY', 'pending', 'Under Scrutiny'],
    ['ALLOCATED', 'pending', 'Allocated to Judge'],
    ['HEARING_FIXED', 'hearing', 'Hearing Fixed'],
    ['REJECTED', 'rejected', 'Rejected'],
    ['DISMISSED', 'rejected', 'Dismissed'],
    ['DRAFT', 'neutral', 'Draft'],
  ])('%s -> %s badge labelled "%s"', (status, variant, label) => {
    expect(statusBadge(status)).toEqual({ variant, label });
  });

  it('covers every status the API can return', () => {
    expect(Object.keys(STATUS_BADGES).sort()).toEqual(
      [
        'ALLOCATED',
        'DECIDED',
        'DISMISSED',
        'DRAFT',
        'FILED',
        'HEARING_FIXED',
        'PENDING',
        'PENDING_ASSIGNMENT',
        'REJECTED',
        'UNDER_SCRUTINY',
      ].sort(),
    );
  });

  it('never leaves a status without a text label (meaning is not colour-only)', () => {
    for (const s of Object.values(STATUS_BADGES)) expect(s.label.length).toBeGreaterThan(2);
  });

  it('falls back safely for an unknown status', () => {
    expect(statusBadge('SOMETHING_NEW' as CaseStatus).label).toBe('SOMETHING_NEW');
  });
});

describe('case helpers', () => {
  it('labels case types', () => {
    expect(caseTypeLabel('BAIL_APPLICATION')).toBe('Bail Application');
    expect(caseTypeLabel('CRIMINAL_APPEAL')).toBe('Criminal Appeal');
  });

  it('shows "Not yet assigned" until a judge is allocated', () => {
    expect(judgeBench({ judge: null, courtroom: null })).toBe('Not yet assigned');
    expect(judgeBench({ judge: 'Imran Qureshi', courtroom: null })).toBe('Imran Qureshi');
    expect(judgeBench({ judge: 'Imran Qureshi', courtroom: 'Court Room 1' })).toBe(
      'Imran Qureshi · Court Room 1',
    );
  });
});

describe('formatters', () => {
  it('formats sizes as B, KB or MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('formats dates as DD-MM-YYYY and date-times as DD-MM-YYYY HH:mm', () => {
    expect(formatDate(new Date(2026, 9, 3))).toBe('03-10-2026');
    expect(formatDateTime(new Date(2026, 9, 3, 9, 5))).toBe('03-10-2026 09:05');
    expect(formatDateTime(new Date(2026, 0, 31, 23, 59))).toBe('31-01-2026 23:59');
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('client-side PDF checks', () => {
  it('accepts PDFs up to 25 MB, case-insensitively', () => {
    const r = checkPdfFiles([file('a.pdf'), file('B.PDF'), file('big.pdf', MAX_PDF_BYTES)]);
    expect(r.accepted).toHaveLength(3);
    expect(r.error).toBeNull();
  });

  it.each([
    ['notes.txt', 1000],
    ['setup.exe', 1000],
    ['plea.pdf.exe', 1000],
    ['noextension', 1000],
    ['huge.pdf', MAX_PDF_BYTES + 1],
    ['empty.pdf', 0],
  ])('refuses %s (%d bytes) with the exact message', (name, size) => {
    const r = checkPdfFiles([file(name, size)]);
    expect(r.accepted).toHaveLength(0);
    expect(r.error).toBe(INVALID_FILE_MESSAGE);
    expect(INVALID_FILE_MESSAGE).toBe('Only PDF format files under 25MB are allowed.');
  });

  it('keeps the valid files when others are refused', () => {
    const r = checkPdfFiles([file('a.pdf'), file('b.txt')]);
    expect(r.accepted.map((f) => f.name)).toEqual(['a.pdf']);
    expect(r.error).toBe(INVALID_FILE_MESSAGE);
  });

  it('ignores duplicates and enforces the 10 file limit', () => {
    const existing = [file('a.pdf', 10)];
    expect(checkPdfFiles([file('a.pdf', 10)], existing).accepted).toHaveLength(0);
    const many = Array.from({ length: 12 }, (_, i) => file(`f${i}.pdf`, 100 + i));
    const r = checkPdfFiles(many);
    expect(r.accepted).toHaveLength(10);
    expect(r.error).toBe(TOO_MANY_FILES_MESSAGE);
  });
});
