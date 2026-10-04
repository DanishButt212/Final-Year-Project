import { Injectable, Logger } from '@nestjs/common';
import { open } from 'node:fs/promises';
import { extname } from 'node:path';

export type EvidenceCategoryName = 'VIDEO' | 'AUDIO' | 'SCANNED_DOCUMENT';

export const ALLOWED_EXTENSIONS: Record<EvidenceCategoryName, string[]> = {
  VIDEO: ['mp4', 'webm'],
  AUDIO: ['mp3', 'wav', 'm4a'],
  SCANNED_DOCUMENT: ['pdf', 'jpg', 'jpeg', 'png'],
};

export const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export const SCREENING_FAILED_MESSAGE = 'Security Screening Failed: Attachment discarded.';

const startsWith = (b: Buffer, bytes: number[], at = 0) => bytes.every((v, i) => b[at + i] === v);
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

/**
 * MOCK security screening (replaces antivirus). A file passes only when its extension is allowed for the chosen
 * category AND its magic bytes match that type. Executables and scripts are always rejected.
 * Real antivirus scanning (for example ClamAV) is a deployment-time addition, not part of this project phase.
 */
@Injectable()
export class MockScreeningService {
  private readonly logger = new Logger('MockScreening');

  async passes(
    path: string,
    originalName: string,
    category: EvidenceCategoryName,
  ): Promise<boolean> {
    const ext = extname(originalName).slice(1).toLowerCase();
    if (!ALLOWED_EXTENSIONS[category].includes(ext))
      return this.reject('extension not allowed for category');
    const handle = await open(path, 'r');
    let head: Buffer;
    try {
      head = Buffer.alloc(16);
      const { bytesRead } = await handle.read(head, 0, 16, 0);
      head = head.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
    if (head.length < 4) return this.reject('file too short');
    // Executables and scripts: Windows PE, ELF, shebang.
    if (
      startsWith(head, [0x4d, 0x5a]) ||
      startsWith(head, [0x7f, 0x45, 0x4c, 0x46]) ||
      startsWith(head, [0x23, 0x21])
    ) {
      return this.reject('executable content');
    }
    return this.magicMatches(ext, head)
      ? true
      : this.reject('content does not match the file type');
  }

  private magicMatches(ext: string, b: Buffer): boolean {
    switch (ext) {
      case 'pdf':
        return ascii(b, 0, 5) === '%PDF-';
      case 'jpg':
      case 'jpeg':
        return startsWith(b, [0xff, 0xd8, 0xff]);
      case 'png':
        return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case 'mp4':
      case 'm4a':
        return ascii(b, 4, 8) === 'ftyp';
      case 'webm':
        return startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]);
      case 'mp3':
        return ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
      case 'wav':
        return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE';
      default:
        return false;
    }
  }

  private reject(why: string): false {
    this.logger.warn(`Upload rejected: ${why}`);
    return false;
  }
}
