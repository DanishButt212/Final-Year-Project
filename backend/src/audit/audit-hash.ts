import { createHash } from 'node:crypto';

/** Metadata keys that must never be stored: exactly one of these names, or ending with one of them (case-insensitive). */
const SECRET_NAMES = [
  'password',
  'passwordHash',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'cvv',
  'cardNumber',
  'secret',
  'apiKey',
  'privateKey',
  'secretKey',
  'encryptionKey',
  'authorization',
];
const SECRET_KEY = new RegExp(`(${SECRET_NAMES.join('|')})$`, 'i');

/** Returns a JSON-safe clone of the metadata with every secret-looking key removed. */
export function sanitizeMetadata(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const clone: unknown = JSON.parse(JSON.stringify(value));
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !SECRET_KEY.test(k))
          .map(([k, x]) => [k, strip(x)]),
      );
    }
    return v;
  };
  return strip(clone);
}

/** JSON with object keys sorted at every level, so the same data always serialises the same way. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export interface HashableEntry {
  id: string;
  createdAt: Date;
  actorId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
}

/** SHA-256 over the canonical string of (id, createdAt, actorId, action, entity, entityId, metadata). */
export function computeEventHash(e: HashableEntry): string {
  const canonical = [
    e.id,
    e.createdAt.toISOString(),
    e.actorId ?? '',
    e.action,
    e.entity ?? '',
    e.entityId ?? '',
    stableStringify(e.metadata ?? null),
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

/** The "user hash" shown in the vault: first 12 hex characters of SHA-256(actorId). */
export function userHash(actorId: string | null): string {
  return actorId ? createHash('sha256').update(actorId).digest('hex').slice(0, 12) : 'system';
}
