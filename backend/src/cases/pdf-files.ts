import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { extname } from 'node:path';

/** multer's absolute cap; the real limit is the max_attachment_mb policy (1 to 100 MB). */
export const HARD_CAP_BYTES = 100 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 10;
const PDF_MAGIC = Buffer.from('%PDF-');

export function hasPdfExtension(originalName: string): boolean {
  return extname(originalName).toLowerCase() === '.pdf';
}

/** True only if the file really starts with the PDF signature, whatever its name or declared type says. */
export async function startsWithPdfMagic(path: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(PDF_MAGIC.length);
    const { bytesRead } = await handle.read(buffer, 0, PDF_MAGIC.length, 0);
    return bytesRead === PDF_MAGIC.length && buffer.equals(PDF_MAGIC);
  } finally {
    await handle.close();
  }
}

export function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Makes an untrusted client file name safe to store and to put in a header:
 * no directories, no control characters, no quotes, bounded length, always ending in .pdf.
 */
export function sanitizeFileName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  let clean = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>:|?*\\/]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  clean = clean.replace(/^\.+/, '');
  if (!clean) clean = 'document.pdf';
  if (!hasPdfExtension(clean)) clean = `${clean}.pdf`;
  if (clean.length > 120) clean = `${clean.slice(0, 116).replace(/\.+$/, '')}.pdf`;
  return clean;
}

/** Best-effort removal of temp files; never throws. */
export async function removeFiles(paths: (string | undefined)[]): Promise<void> {
  await Promise.all(paths.filter(Boolean).map((p) => unlink(p as string).catch(() => undefined)));
}
