import { AuthUser } from './decorators';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pkToday } from './pk-time';

export const representedPetitioner = (cnic: string): Prisma.CasePartyWhereInput => ({
  cnic, role: 'PETITIONER', lawyerId: { not: null },
});

export function activeHearingCoverage(userId: string): Prisma.HearingCoverageWhereInput {
  const today = pkToday();
  return {
    status: 'APPROVED',
    hearingDate: today,
    substitute: { userId, verificationStatus: 'VERIFIED' },
    hearing: { date: today, lastSummons: false, status: { in: ['SCHEDULED', 'ADJOURNED', 'HELD'] } },
  };
}

/** Cases a user may see: readers all, judges their own, litigants what they filed, lawyers what they filed or appear in. */
export async function caseScopeFor(
  prisma: PrismaService,
  user: AuthUser,
  readCoverage = false,
): Promise<Prisma.CaseWhereInput> {
  if (user.role === 'ADMIN') return {};
  if (user.role === 'JUDGE') return { judgeId: user.id };
  const or: Prisma.CaseWhereInput[] = [{ filedById: user.id }];
  if (user.role === 'LITIGANT') {
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { cnic: true } });
    if (account) or.push({ parties: { some: representedPetitioner(account.cnic) } });
  }
  if (user.role === 'LAWYER') {
    const profile = await prisma.lawyerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (profile) or.push({ parties: { some: { lawyerId: profile.id } } });
    if (readCoverage) or.push({ hearings: { some: { coverageRequests: { some: activeHearingCoverage(user.id) } } } });
  }
  return { OR: or };
}

/** Everyone who should hear about a case: whoever filed it plus every lawyer on it. */
export async function caseAudience(
  db: Prisma.TransactionClient | PrismaService,
  caseId: string,
): Promise<string[]> {
  const c = await db.case.findUnique({
    where: { id: caseId },
    select: {
      filedById: true,
      parties: { select: { cnic: true, role: true, lawyer: { select: { userId: true } } } },
    },
  });
  if (!c) return [];
  const cnics = c.parties.flatMap((p) => p.cnic && p.role === 'PETITIONER' && p.lawyer ? [p.cnic] : []);
  const litigants = cnics.length ? await db.user.findMany({
    where: { role: 'LITIGANT', status: 'ACTIVE', cnic: { in: cnics } }, select: { id: true },
  }) : [];
  return [...new Set([
    c.filedById,
    ...c.parties.flatMap((p) => p.lawyer ? [p.lawyer.userId] : []),
    ...litigants.map((p) => p.id),
  ])];
}
