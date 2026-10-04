import { Injectable } from '@nestjs/common';
import { freemem, totalmem } from 'node:os';
import { CaseStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_CASE_STATUSES } from './constants';

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Last `days` UTC dates (oldest first) with the count for each, zero when nothing happened. */
function series(days: number, counts: Map<string, number>) {
  const today = new Date();
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() - (days - 1),
  );
  return Array.from({ length: days }, (_, i) => {
    const date = isoDay(new Date(start + i * DAY_MS));
    return { date, count: counts.get(date) ?? 0 };
  });
}

/** UC-1.3: live metrics for the Centralized Operations & Analytics Board. */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(courtId?: string) {
    const scope: Prisma.CaseWhereInput = courtId ? { courtId } : {};
    const now = new Date();
    const since30 = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
    );
    const since7 = new Date(now.getTime() - 7 * DAY_MS);

    const [
      byStatus,
      filed,
      decided,
      docsTotal,
      docsRecent,
      users,
      pendingList,
      pendingLawyers,
      courts,
    ] = await Promise.all([
      this.prisma.case.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      this.prisma.case.groupBy({
        by: ['filingDate'],
        where: { ...scope, filingDate: { gte: since30 } },
        _count: { _all: true },
      }),
      this.prisma.case.findMany({
        where: { ...scope, decidedAt: { gte: since30 } },
        select: { decidedAt: true },
      }),
      this.prisma.caseDocument.count({ where: { case: scope } }),
      this.prisma.caseDocument.count({ where: { case: scope, createdAt: { gte: since7 } } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { status: { not: 'DEACTIVATED' } },
        _count: { _all: true },
      }),
      this.prisma.case.findMany({
        where: { ...scope, status: 'PENDING_ASSIGNMENT' },
        select: { id: true, ucn: true, title: true, caseType: true, filingDate: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
      this.prisma.lawyerProfile.count({
        where: { verificationStatus: 'PENDING', user: { status: 'ACTIVE' } },
      }),
      this.prisma.court.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const statusCounts = Object.fromEntries(Object.values(CaseStatus).map((s) => [s, 0])) as Record<
      CaseStatus,
      number
    >;
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const filedMap = new Map(
      filed.filter((r) => r.filingDate).map((r) => [isoDay(r.filingDate as Date), r._count._all]),
    );
    const decidedMap = new Map<string, number>();
    for (const row of decided) {
      const key = isoDay(row.decidedAt as Date);
      decidedMap.set(key, (decidedMap.get(key) ?? 0) + 1);
    }

    return {
      courtId: courtId ?? null,
      courts,
      cases: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        byStatus: statusCounts,
        pendingAssignment: statusCounts.PENDING_ASSIGNMENT,
        active: ACTIVE_CASE_STATUSES.reduce((sum, s) => sum + statusCounts[s], 0),
        filedPerDay: series(30, filedMap),
        decidedPerDay: series(30, decidedMap),
      },
      pendingAssignmentList: pendingList,
      pendingLawyerApprovals: pendingLawyers,
      documents: { total: docsTotal, attachedLast7Days: docsRecent },
      users: {
        total: users.reduce((sum, u) => sum + u._count._all, 0),
        byRole: Object.fromEntries(users.map((u) => [u.role, u._count._all])),
      },
      health: await this.health(),
    };
  }

  private async health() {
    const started = process.hrtime.bigint();
    let database: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    const mem = process.memoryUsage();
    const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
    return {
      uptimeSeconds: Math.round(process.uptime()),
      database,
      databaseLatencyMs: Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100,
      memory: {
        rssMb: mb(mem.rss),
        heapUsedMb: mb(mem.heapUsed),
        heapTotalMb: mb(mem.heapTotal),
        systemUsedPercent: Math.round((1 - freemem() / totalmem()) * 100),
      },
    };
  }
}
