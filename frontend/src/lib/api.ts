import axios, { AxiosError } from 'axios';
import type { ApiErrorBody } from './types';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
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

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const url = error.config?.url ?? '';
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
