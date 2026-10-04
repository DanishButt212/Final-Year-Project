import { nextSequence } from '../common/counters';
import { Prisma } from '../generated/prisma/client';

/** Creates the chamber (and its CH-<6 digits> code) of a lawyer if it does not exist yet. Idempotent. */
export async function ensureChamber(
  tx: Prisma.TransactionClient,
  lawyer: {
    id: string;
    user: { firstName: string; lastName: string; email: string; phone: string };
  },
) {
  const existing = await tx.chamberProfile.findUnique({ where: { lawyerId: lawyer.id } });
  if (existing) return existing;
  const n = await nextSequence(tx, 'CHAMBER', 0);
  return tx.chamberProfile.create({
    data: {
      lawyerId: lawyer.id,
      chamberCode: `CH-${String(n).padStart(6, '0')}`,
      name: `${lawyer.user.lastName} & Associates`,
      email: lawyer.user.email,
      phone: lawyer.user.phone,
    },
  });
}
