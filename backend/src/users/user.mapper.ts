import { LawyerProfile, User } from '../generated/prisma/client';

export type UserWithProfile = User & { lawyerProfile?: LawyerProfile | null };

/** The only shape in which a user ever leaves the API: no password hash, no internals. */
export function toPublicUser(user: UserWithProfile) {
  return {
    id: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    cnic: user.cnic,
    phone: user.phone,
    profileImage: user.profileImage,
    status: user.status,
    createdAt: user.createdAt,
    ...(user.lawyerProfile
      ? {
          lawyerProfile: {
            barNumber: user.lawyerProfile.barNumber,
            verificationStatus: user.lawyerProfile.verificationStatus,
          },
        }
      : {}),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
