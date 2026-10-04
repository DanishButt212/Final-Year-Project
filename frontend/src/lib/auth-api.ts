import { api } from './api';
import type { Paginated, Role, User } from './types';

export interface RegisterPayload {
  role: 'LITIGANT' | 'LAWYER';
  firstName: string;
  lastName: string;
  cnic: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  barNumber?: string;
}

export const authApi = {
  async register(payload: RegisterPayload) {
    return (await api.post<{ message: string; user: User }>('/auth/register', payload)).data;
  },
  async login(identifier: string, password: string, chamberCode?: string) {
    return (
      await api.post<{ message: string; user: User }>('/auth/login', {
        identifier,
        password,
        ...(chamberCode ? { chamberCode } : {}),
      })
    ).data;
  },
  async logout() {
    await api.post('/auth/logout');
  },
  async me() {
    return (await api.get<{ user: User }>('/auth/me')).data.user;
  },
  async forgotPassword(email: string) {
    return (await api.post<{ message: string }>('/auth/forgot-password', { email })).data;
  },
  async resetPassword(token: string, password: string, confirmPassword: string) {
    return (
      await api.post<{ message: string }>('/auth/reset-password', {
        token,
        password,
        confirmPassword,
      })
    ).data;
  },
};

export const usersApi = {
  async updateMe(body: { phone?: string; profileImage?: string | null }) {
    return (await api.patch<{ message: string; user: User }>('/users/me', body)).data;
  },
  async list(params: { page: number; limit: number; role?: Role; search?: string }) {
    return (await api.get<Paginated<User>>('/users', { params })).data;
  },
};
