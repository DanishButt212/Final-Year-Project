import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, rename, rm, unlink } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { StorageService } from './storage.service';

/** Stores files on the local disk under UPLOAD_DIR. Keys can never escape that folder. */
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.getOrThrow<string>('UPLOAD_DIR'));
  }

  /** Resolves a key to an absolute path and refuses anything outside the storage root. */
  private pathFor(key: string): string {
    if (!key || key.includes('\0') || key.split(/[\\/]/).includes('..')) {
      throw new Error('Invalid storage key');
    }
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async saveFromPath(tempPath: string, key: string): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    try {
      await rename(tempPath, target);
    } catch (error) {
      // The temp folder can be on another drive; fall back to copy + delete.
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(tempPath, target);
      await unlink(tempPath);
    }
  }

  async saveFromStream(stream: Readable, key: string): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    try {
      await pipeline(stream, createWriteStream(target, { flags: 'wx' }));
    } catch (error) {
      await rm(target, { force: true });
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  createReadStream(key: string): Readable {
    return createReadStream(this.pathFor(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async removePrefix(prefix: string): Promise<void> {
    await rm(this.pathFor(prefix), { recursive: true, force: true });
  }
}
