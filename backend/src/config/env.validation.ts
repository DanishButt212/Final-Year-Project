import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Env {
  NODE_ENV: string;
  PORT: number;
  /** The web app's origin (FRONTEND_URL, or the older FRONTEND_ORIGIN); the first entry is used in e-mail links. */
  FRONTEND_ORIGIN: string;
  /** Every origin allowed by CORS (comma-separated FRONTEND_URL). */
  CORS_ORIGINS: string[];
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  COOKIE_NAME: string;
  RESET_TOKEN_TTL_MINUTES: number;
  BCRYPT_ROUNDS: number;
  AUTH_THROTTLE_LIMIT: number;
  FORGOT_THROTTLE_LIMIT: number;
  UPLOAD_THROTTLE_LIMIT: number;
  /** Final location of uploaded files (git-ignored). */
  UPLOAD_DIR: string;
  /** Where multer first writes incoming files before they are validated and moved. */
  UPLOAD_TMP_DIR: string;
  /** Base64 of 32 random bytes; the evidence vault refuses to start without it. */
  EVIDENCE_ENCRYPTION_KEY?: string;
  /** Base64 of 32 random bytes; the summons module refuses to start without it. */
  SUMMONS_SEAL_SECRET?: string;
  /** Base64 of 32 random bytes; the reports module refuses to start without it. */
  REPORT_SEAL_SECRET?: string;
  /** Jitsi as a Service (optional, all three together); without them the courtroom uses public meet.jit.si. */
  JAAS_APP_ID?: string;
  JAAS_KID?: string;
  /** Base64 of the PEM private key used to sign JaaS tokens. Never logged. */
  JAAS_PRIVATE_KEY?: string;
  /** Express "trust proxy" value (deployment behind a reverse proxy only). */
  TRUST_PROXY?: string;
  /** local (default) or s3. */
  STORAGE_DRIVER: 'local' | 's3';
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  /** "false" for virtual-hosted style; path style (the default) works with R2, Supabase and MinIO. */
  S3_FORCE_PATH_STYLE?: string;
}

const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'EVIDENCE_ENCRYPTION_KEY',
  'SUMMONS_SEAL_SECRET',
  'REPORT_SEAL_SECRET',
] as const;
const BASE64_32 = ['EVIDENCE_ENCRYPTION_KEY', 'SUMMONS_SEAL_SECRET', 'REPORT_SEAL_SECRET'] as const;
const S3_REQUIRED = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const isPlaceholder = (v: string) => v === '' || v.startsWith('CHANGE_ME');

/**
 * Fails fast at startup when required settings are missing or weak. Error messages name the variables only and
 * never include their values.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const nodeEnvRaw = text(raw.NODE_ENV) || 'development';
  const production = nodeEnvRaw === 'production';
  const storage = text(raw.STORAGE_DRIVER) || 'local';
  const problems: string[] = [];

  const missing: string[] = REQUIRED.filter((k) => isPlaceholder(text(raw[k])));
  if (production && isPlaceholder(text(raw.FRONTEND_URL) || text(raw.FRONTEND_ORIGIN))) {
    missing.push('FRONTEND_URL');
  }
  if (storage === 's3') missing.push(...S3_REQUIRED.filter((k) => isPlaceholder(text(raw[k]))));
  if (missing.length > 0) problems.push(`missing: ${missing.join(', ')}`);

  const jwt = text(raw.JWT_SECRET);
  if (!isPlaceholder(jwt) && jwt.length < 32) {
    problems.push('JWT_SECRET must be a random string of at least 32 characters');
  }
  for (const k of BASE64_32) {
    const v = text(raw[k]);
    if (!isPlaceholder(v) && Buffer.from(v, 'base64').length !== 32) {
      problems.push(`${k} must be 32 random bytes encoded as base64`);
    }
  }
  if (storage !== 'local' && storage !== 's3') problems.push('STORAGE_DRIVER must be local or s3');
  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration (${problems.join('; ')}). See backend/.env.example and docs/DEPLOYMENT.md.`,
    );
  }
  if (production && storage === 'local') {
    console.warn(
      'STORAGE_DRIVER is local in production: uploaded files are lost when the host disk is wiped. Use s3.',
    );
  }

  const origins = (text(raw.FRONTEND_URL) || text(raw.FRONTEND_ORIGIN) || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const nodeEnv = nodeEnvRaw;
  return {
    NODE_ENV: nodeEnv,
    PORT: Number(raw.PORT ?? 4000),
    FRONTEND_ORIGIN: origins[0],
    CORS_ORIGINS: origins,
    DATABASE_URL: String(raw.DATABASE_URL),
    JWT_SECRET: jwt,
    JWT_EXPIRES_IN: String(raw.JWT_EXPIRES_IN ?? '1d'),
    COOKIE_NAME: String(raw.COOKIE_NAME ?? 'da_token'),
    RESET_TOKEN_TTL_MINUTES: Number(raw.RESET_TOKEN_TTL_MINUTES ?? 60),
    BCRYPT_ROUNDS: Number(raw.BCRYPT_ROUNDS ?? (nodeEnv === 'test' ? 4 : 12)),
    AUTH_THROTTLE_LIMIT: Number(raw.AUTH_THROTTLE_LIMIT ?? 30),
    FORGOT_THROTTLE_LIMIT: Number(raw.FORGOT_THROTTLE_LIMIT ?? 10),
    UPLOAD_THROTTLE_LIMIT: Number(raw.UPLOAD_THROTTLE_LIMIT ?? 20),
    UPLOAD_DIR: resolve(String(raw.UPLOAD_DIR ?? join(process.cwd(), 'uploads'))),
    EVIDENCE_ENCRYPTION_KEY: raw.EVIDENCE_ENCRYPTION_KEY
      ? String(raw.EVIDENCE_ENCRYPTION_KEY)
      : undefined,
    SUMMONS_SEAL_SECRET: raw.SUMMONS_SEAL_SECRET ? String(raw.SUMMONS_SEAL_SECRET) : undefined,
    REPORT_SEAL_SECRET: raw.REPORT_SEAL_SECRET ? String(raw.REPORT_SEAL_SECRET) : undefined,
    JAAS_APP_ID: raw.JAAS_APP_ID ? String(raw.JAAS_APP_ID).trim() : undefined,
    JAAS_KID: raw.JAAS_KID ? String(raw.JAAS_KID).trim() : undefined,
    JAAS_PRIVATE_KEY: raw.JAAS_PRIVATE_KEY ? String(raw.JAAS_PRIVATE_KEY).trim() : undefined,
    TRUST_PROXY: raw.TRUST_PROXY ? String(raw.TRUST_PROXY) : undefined,
    STORAGE_DRIVER: storage as Env['STORAGE_DRIVER'],
    S3_ENDPOINT: text(raw.S3_ENDPOINT) || undefined,
    S3_REGION: text(raw.S3_REGION) || undefined,
    S3_BUCKET: text(raw.S3_BUCKET) || undefined,
    S3_ACCESS_KEY_ID: text(raw.S3_ACCESS_KEY_ID) || undefined,
    S3_SECRET_ACCESS_KEY: text(raw.S3_SECRET_ACCESS_KEY) || undefined,
    S3_FORCE_PATH_STYLE: text(raw.S3_FORCE_PATH_STYLE) || undefined,
    UPLOAD_TMP_DIR: resolve(String(raw.UPLOAD_TMP_DIR ?? join(tmpdir(), 'digitaladaalat-uploads'))),
  };
}
