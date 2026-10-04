import { AuthUser } from './decorators';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Cases a user may see: admins all, judges their own, litigants what they filed, lawyers what they filed or appear in. */
export async function caseScopeFor(
  prisma: PrismaService,
  user: AuthUser,
): Promise<Prisma.CaseWhereInput> {
  if (user.role === 'ADMIN') return {};
  if (user.role === 'JUDGE') return { judgeId: user.id };
  const or: Prisma.CaseWhereInput[] = [{ filedById: user.id }];
  if (user.role === 'LAWYER') {
    const profile = await prisma.lawyerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (profile) or.push({ parties: { some: { lawyerId: profile.id } } });
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
      parties: { select: { lawyer: { select: { userId: true } } } },
    },
  });
  if (!c) return [];
  return [
    ...new Set([c.filedById, ...c.parties.flatMap((p) => (p.lawyer ? [p.lawyer.userId] : []))]),
  ];
}
