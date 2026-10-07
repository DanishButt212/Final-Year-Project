import axios, { AxiosError } from 'axios';
import type { ApiErrorBody } from './types';

export const api = axios.create({
  // Relative by default: Vite (dev) and Vercel (production) proxy /api to the backend, so the auth cookie is
  // first-party. VITE_API_URL is only for calling an API on another origin directly.
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // send the httpOnly auth cookie
  headers: { 'Content-Type': 'application/json' },
});

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** The auth provider registers a callback that runs when a protected call returns 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

// Credential endpoints legitimately answer 401 ("Invalid username or password."), so they are not "session expired".
const SILENT_401 = ['/auth/login', '/auth/me', '/auth/logout', '/auth/register'];

export const SESSION_NOTICE_KEY = 'da_session_notice';
export const SESSION_TERMINATED_TEXT =
  'Your session was ended for security reasons. Please sign in again.';

/** Reads (without clearing) the message left for the login page. */
export function peekSessionNotice(): string | null {
  try {
    return sessionStorage.getItem(SESSION_NOTICE_KEY);
  } catch {
    return null;
  }
}

/** Reads and clears the message left for the login page when the security engine ended the session. */
export function takeSessionNotice(): string | null {
  try {
    const value = sessionStorage.getItem(SESSION_NOTICE_KEY);
    if (value) sessionStorage.removeItem(SESSION_NOTICE_KEY);
    return value;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && error.response.data?.code === 'SESSION_TERMINATED') {
      try {
        sessionStorage.setItem(SESSION_NOTICE_KEY, SESSION_TERMINATED_TEXT);
      } catch {
        // storage can be blocked; the user is still sent to the login page
      }
    }
    if (error.response?.status === 401 && !SILENT_401.some((p) => url.startsWith(p))) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/** Pulls the API's consistent error shape out of an Axios error. */
export function parseApiError(error: unknown): ApiErrorBody {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (error.response?.data?.message) return error.response.data;
    if (!error.response) {
      return {
        statusCode: 0,
        code: 'NETWORK_ERROR',
        message: 'Cannot reach the server. Check your connection and try again.',
      };
    }
    return {
      statusCode: error.response.status,
      code: 'ERROR',
      message: 'Something went wrong. Please try again later.',
    };
  }
  return { statusCode: 0, code: 'ERROR', message: 'Something went wrong. Please try again later.' };
}
