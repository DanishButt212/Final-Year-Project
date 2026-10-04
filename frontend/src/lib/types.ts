export type Role = 'LITIGANT' | 'LAWYER' | 'INTERN' | 'PROCESS_SERVER' | 'JUDGE' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'DEACTIVATED';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface User {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  username: string | null;
  cnic: string;
  phone: string;
  profileImage: string | null;
  status: UserStatus;
  createdAt: string;
  lawyerProfile?: { barNumber: string | null; verificationStatus: VerificationStatus };
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: { field: string; messages: string[] }[];
}
