import type { Readable } from 'node:stream';

/**
 * Where uploaded files live. Application code only talks to this interface, so the local-disk
 * implementation can be swapped for cloud storage (S3, Azure Blob, ...) without touching the features.
 * A `key` is a relative, forward-slash path such as `cases/<caseId>/<uuid>.pdf`.
 */
export abstract class StorageService {
  /** Moves a finished temp file into storage under `key`. */
  abstract saveFromPath(tempPath: string, key: string): Promise<void>;
  abstract createReadStream(key: string): Readable;
  abstract exists(key: string): Promise<boolean>;
  /** Deletes every file whose key starts with `prefix` (used to roll back a failed submission). */
  abstract removePrefix(prefix: string): Promise<void>;
}
