import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { RequestMeta } from '../admin/constants';
import { caseScopeFor } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { nextChallanNo } from '../common/counters';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { calculateLedger, feeInputHash, FeeInputs, LedgerLine } from './fee-calculator';
import { challanPdf } from './pdf';
import { pkToday } from '../common/pk-time';

const CASE_TYPE_LABEL: Record<string, string> = {
  CIVIL_SUIT: 'Civil Suit',
  CRIMINAL_APPEAL: 'Criminal Appeal',
  WRIT_PETITION: 'Writ Petition',
  BAIL_APPLICATION: 'Bail Application',
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Today in Pakistan time (UTC midnight, as stored in @db.Date). */
const todayUtc = () => pkToday();

const challanInclude = {
  case: { select: { id: true, ucn: true, title: true, caseType: true } },
  payments: {
    where: { status: 'SUCCESS' as const },
    orderBy: { paidAt: 'desc' as const },
    take: 1,
    select: { id: true, receiptNo: true, paidAt: true },
  },
} satisfies Prisma.ChallanInclude;

type ChallanRow = Prisma.ChallanGetPayload<{ include: typeof challanInclude }>;

export function challanView(c: ChallanRow) {
  const paid = c.payments[0];
  return {
    id: c.id,
    challanNo: c.challanNo,
    caseId: c.caseId,
    ucn: c.case.ucn,
    title: c.case.title,
    caseType: c.case.caseType,
    amount: c.amount.toFixed(2),
    status: c.status,
    issuedAt: c.issuedAt,
    dueDate: isoDay(c.dueDate),
    overdue: c.status === 'UNPAID' && c.dueDate.getTime() < todayUtc().getTime(),
    ledger: c.ledger as unknown as LedgerLine[],
    payment: paid ? { id: paid.id, receiptNo: paid.receiptNo, paidAt: paid.paidAt } : null,
  };
}

/** UC-4.1 Generate Court Fee Challan. */
@Injectable()
export class ChallansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private async ownCase(user: AuthUser, caseId: string) {
    const c = await this.prisma.case.findFirst({
      where: { AND: [{ id: caseId }, await caseScopeFor(this.prisma, user)] },
      select: { id: true, ucn: true, status: true, caseType: true, claimAmountPkr: true },
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    return c;
  }

  private async inputsFor(c: {
    caseType: FeeInputs['caseType'];
    claimAmountPkr: Prisma.Decimal | null;
  }): Promise<FeeInputs> {
    const policy = await this.settings.feePolicy();
    return {
      caseType: c.caseType,
      baseFee: await this.settings.baseFee(c.caseType),
      claimAmountPkr: c.claimAmountPkr,
      adValoremPercent: policy.adValoremPercent,
      adValoremCapPkr: policy.adValoremCapPkr,
      rateModifierPercent: policy.filingFeeRateModifier,
    };
  }

  async get(user: AuthUser, caseId: string) {
    await this.ownCase(user, caseId);
    const c = await this.prisma.challan.findFirst({
      where: { caseId, status: { in: ['UNPAID', 'PAID'] } },
      orderBy: { issuedAt: 'desc' },
      include: challanInclude,
    });
    return { challan: c ? challanView(c) : null };
  }

  /** Calculates and generates the challan. Idempotent: one active challan per case; paid challans never change. */
  async generate(user: AuthUser, caseId: string, meta: RequestMeta) {
    const c = await this.ownCase(user, caseId);
    if (c.status === 'DRAFT') {
      throw new ConflictException({
        code: 'CASE_NOT_FILED',
        message: 'Submit the case before calculating its fees.',
      });
    }
    const inputs = await this.inputsFor(c);
    const hash = feeInputHash(inputs);
    const { lines, total } = calculateLedger(inputs);
    const dueDays = (await this.settings.feePolicy()).challanDueDays;

    const result = await this.prisma.$transaction(async (tx) => {
      // One challan per case even when two requests arrive together.
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${caseId}))) AS l`;
      const existing = await tx.challan.findFirst({
        where: { caseId, status: { in: ['UNPAID', 'PAID'] } },
        orderBy: { issuedAt: 'desc' },
      });
      if (existing && (existing.status === 'PAID' || existing.inputHash === hash)) {
        return { id: existing.id, message: 'Your challan is ready.' };
      }
      if (existing) {
        await tx.challan.update({
          where: { id: existing.id },
          data: {
            amount: total,
            ledger: lines as unknown as Prisma.InputJsonValue,
            inputHash: hash,
          },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.CHALLAN_RECALCULATED,
          actorId: user.id,
          actorRole: user.role,
          entity: 'Challan',
          entityId: existing.id,
          metadata: { ucn: c.ucn, total: total.toFixed(2) },
          ...meta,
        });
        return { id: existing.id, message: 'Fees recalculated.' };
      }
      const due = new Date(todayUtc().getTime() + dueDays * 86_400_000);
      const created = await tx.challan.create({
        data: {
          challanNo: await nextChallanNo(tx),
          caseId,
          payerId: user.id,
          amount: total,
          dueDate: due,
          ledger: lines as unknown as Prisma.InputJsonValue,
          inputHash: hash,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.CHALLAN_GENERATED,
        actorId: user.id,
        actorRole: user.role,
        entity: 'Challan',
        entityId: created.id,
        metadata: { ucn: c.ucn, challanNo: created.challanNo, total: total.toFixed(2) },
        ...meta,
      });
      return { id: created.id, message: 'Challan generated.' };
    });

    const challan = await this.prisma.challan.findUniqueOrThrow({
      where: { id: result.id },
      include: challanInclude,
    });
    return { message: result.message, challan: challanView(challan) };
  }

  async pdf(user: AuthUser, challanId: string) {
    const c = await this.prisma.challan.findFirst({
      where: { id: challanId, case: await caseScopeFor(this.prisma, user) },
      include: challanInclude,
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    return challanPdf({
      challanNo: c.challanNo,
      ucn: c.case.ucn,
      title: c.case.title,
      caseTypeLabel: CASE_TYPE_LABEL[c.case.caseType] ?? c.case.caseType,
      status: c.status,
      issuedAt: c.issuedAt,
      dueDate: c.dueDate,
      lines: c.ledger as unknown as LedgerLine[],
    });
  }
}
