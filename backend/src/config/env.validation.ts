import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Env {
  NODE_ENV: string;
  PORT: number;
  FRONTEND_ORIGIN: string;
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
}

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'] as const;

/** Fails fast at startup when required settings are missing or weak. */
export function validateEnv(raw: Record<string, unknown>): Env {
  for (const key of REQUIRED) {
    if (!raw[key] || String(raw[key]).trim() === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  const secret = String(raw.JWT_SECRET);
  if (secret === 'CHANGE_ME' || secret.length < 32) {
    throw new Error('JWT_SECRET must be a random string of at least 32 characters.');
  }
  const nodeEnv = String(raw.NODE_ENV ?? 'development');
  return {
    NODE_ENV: nodeEnv,
    PORT: Number(raw.PORT ?? 4000),
    FRONTEND_ORIGIN: String(raw.FRONTEND_ORIGIN ?? 'http://localhost:5173'),
    DATABASE_URL: String(raw.DATABASE_URL),
    JWT_SECRET: secret,
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
    UPLOAD_TMP_DIR: resolve(String(raw.UPLOAD_TMP_DIR ?? join(tmpdir(), 'digitaladaalat-uploads'))),
  };
}
