import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageService } from '../storage/local-storage.service';
import { hasPdfExtension, sanitizeFileName, sha256OfFile, startsWithPdfMagic } from './pdf-files';
import { CASE_TYPE_CODE, formatUcn, generateUcn, UCN_REGEX } from './ucn';

describe('UCN', () => {
  it('formats DA-<year>-<code>-<6 digits>', () => {
    expect(formatUcn(2026, 'CIV', 45)).toBe('DA-2026-CIV-000045');
    expect(formatUcn(2027, 'BAL', 1)).toBe('DA-2027-BAL-000001');
    expect(UCN_REGEX.test('DA-2026-CIV-000045')).toBe(true);
    expect(UCN_REGEX.test('DA-2026-MUL-000001')).toBe(false);
    expect(UCN_REGEX.test('DA-2026-CIV-45')).toBe(false);
  });

  it('has a code for every case type', () => {
    expect(CASE_TYPE_CODE).toEqual({
      CIVIL_SUIT: 'CIV',
      CRIMINAL_APPEAL: 'CRA',
      WRIT_PETITION: 'WRT',
      BAIL_APPLICATION: 'BAL',
    });
  });

  it('takes the number from the atomic counter statement', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ lastValue: 45 }]) };
    await expect(generateUcn(tx as never, 'CIVIL_SUIT', 2026)).resolves.toBe('DA-2026-CIV-000045');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('pdf-files', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'da-unit-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('checks the extension case-insensitively', () => {
    expect(hasPdfExtension('a.PDF')).toBe(true);
    expect(hasPdfExtension('a.pdf.exe')).toBe(false);
    expect(hasPdfExtension('pdf')).toBe(false);
  });

  it('detects the %PDF- signature, not the name', async () => {
    const good = join(dir, 'good.pdf');
    const bad = join(dir, 'bad.pdf');
    const tiny = join(dir, 'tiny.pdf');
    writeFileSync(good, '%PDF-1.7 rest of file');
    writeFileSync(bad, 'MZ this is an exe');
    writeFileSync(tiny, '%PD');
    expect(await startsWithPdfMagic(good)).toBe(true);
    expect(await startsWithPdfMagic(bad)).toBe(false);
    expect(await startsWithPdfMagic(tiny)).toBe(false);
  });

  it('hashes file content with SHA-256', async () => {
    const f = join(dir, 'h.pdf');
    writeFileSync(f, 'abc');
    expect(await sha256OfFile(f)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it.each([
    ['../../etc/passwd', 'passwd.pdf'],
    ['C:\\Users\\x\\plea.pdf', 'plea.pdf'],
    ['a"b<c>.pdf', 'a_b_c_.pdf'],
    ['   ', 'document.pdf'],
    ['.hidden.pdf', 'hidden.pdf'],
    ['no-extension', 'no-extension.pdf'],
    ['line\nbreak.pdf', 'line_break.pdf'],
  ])('sanitizes %j to %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('bounds the length', () => {
    expect(sanitizeFileName(`${'x'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});

describe('LocalStorageService', () => {
  let root: string;
  let storage: LocalStorageService;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'da-storage-'));
    storage = new LocalStorageService({ getOrThrow: () => root } as never);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('saves, reads back and removes by prefix', async () => {
    const tmp = join(root, 'incoming.upload');
    writeFileSync(tmp, '%PDF-1.4 hello');
    await storage.saveFromPath(tmp, 'cases/abc/file.pdf');
    expect(await storage.exists('cases/abc/file.pdf')).toBe(true);
    await storage.removePrefix('cases/abc');
    expect(await storage.exists('cases/abc/file.pdf')).toBe(false);
  });

  it.each(['../outside.pdf', 'cases/../../outside.pdf', '..\\outside.pdf', '', 'a\0b.pdf'])(
    'refuses the unsafe key %j',
    async (key) => {
      await expect(storage.saveFromPath(join(root, 'x'), key)).rejects.toThrow(
        'Invalid storage key',
      );
      expect(() => storage.createReadStream(key)).toThrow('Invalid storage key');
    },
  );
});
