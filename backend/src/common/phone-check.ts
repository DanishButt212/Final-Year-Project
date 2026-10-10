import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

export const PHONE_IN_USE_MESSAGE = 'This phone number is already registered to another account.';

/**
 * A mobile number may belong to only one active account (application rule, no database constraint, so
 * deleted or suspended accounts do not block the number). `exceptUserId` skips the caller's own account.
 */
export async function assertPhoneFree(
  prisma: Pick<PrismaService, 'user'>,
  phone: string,
  exceptUserId?: string,
): Promise<void> {
  const taken = await prisma.user.findFirst({
    where: { phone, status: 'ACTIVE', ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true },
  });
  if (taken) {
    throw new ConflictException({
      code: 'PHONE_IN_USE',
      message: PHONE_IN_USE_MESSAGE,
      details: [{ field: 'phone', messages: [PHONE_IN_USE_MESSAGE] }],
    });
  }
}
