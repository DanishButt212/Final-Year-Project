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
  };
}
