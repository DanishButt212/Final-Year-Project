import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Removes the temporary upload folders created by the e2e tests. */
export default function globalTeardown(): void {
  for (const name of ['digitaladaalat-test-uploads', 'digitaladaalat-test-uploads-tmp']) {
    rmSync(join(tmpdir(), name), { recursive: true, force: true });
  }
}
