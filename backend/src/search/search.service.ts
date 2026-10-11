import { Injectable } from '@nestjs/common';
import { computeProgress, progressSelect } from '../cases/case-progress';
import { caseScopeFor } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

export const SEARCH_LIMIT = 8;

/** Roles that have case pages; interns and process servers have no case search. */
const CASE_SEARCH_ROLES = new Set(['LITIGANT', 'LAWYER', 'JUDGE', 'ADMIN']);

/**
 * Global search (command palette). Matches the UCN (prefix or exact, case-insensitive), party names and the
 * case title, strictly inside the cases the user may already open (common/case-access.ts): litigants what they
 * filed, lawyers what they filed or appear in, judges what is allocated to them, administrators everything.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async search(user: AuthUser, q: string) {
    if (!CASE_SEARCH_ROLES.has(user.role)) return { cases: [] };
    const term = q.trim();
    const ucnLike = /^da/i.test(term) ? term.toUpperCase() : null;
    const match: Prisma.CaseWhereInput = {
      OR: [
        ...(ucnLike ? [{ ucn: { startsWith: ucnLike } }] : []),
        { ucn: { equals: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { parties: { some: { name: { contains: term, mode: 'insensitive' } } } },
      ],
    };
    const rows = await this.prisma.case.findMany({
      where: { AND: [await caseScopeFor(this.prisma, user), match, { status: { not: 'DRAFT' } }] },
      select: {
        ...progressSelect,
        id: true,
        ucn: true,
        title: true,
        caseType: true,
        status: true,
        parties: {
          orderBy: [{ role: 'asc' }, { position: 'asc' }],
          select: { name: true, role: true },
          take: 4,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: SEARCH_LIMIT,
    });
    const slotMinutes = (await this.settings.schedulePolicy()).hearingSlotMinutes;
    return {
      cases: rows.map((c) => {
        const progress = computeProgress(c, slotMinutes);
        return {
          id: c.id,
          ucn: c.ucn,
          title: c.title,
          caseType: c.caseType,
          status: c.status,
          stage: progress.terminal ?? progress.current ?? 'DECIDED',
          parties: c.parties.map((p) => p.name),
        };
      }),
    };
  }
}
