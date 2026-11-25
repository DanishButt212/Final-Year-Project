import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { RequestMeta } from '../admin/constants';
import { caseScopeFor } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { nextChallanNo } from '../common/counters';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_SESSION_MINUTES } from './payments.service';
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
const FIXED_FILING_PREFIX = 'fixed-filing:';

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

  private async ownCase(user: AuthUser, caseId: string, readCoverage = false) {
    const c = await this.prisma.case.findFirst({
      where: { AND: [{ id: caseId }, await caseScopeFor(this.prisma, user, readCoverage)] },
      select: {
        id: true,
        ucn: true,
        status: true,
        caseType: true,
        claimAmountPkr: true,
        filedBy: { select: { role: true } },
      },
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
    await this.ownCase(user, caseId, true);
    const c = await this.prisma.challan.findFirst({
      where: { caseId, status: { in: ['UNPAID', 'PAID'] } },
      orderBy: { issuedAt: 'desc' },
      include: challanInclude,
    });
    return { challan: c ? challanView(c) : null };
  }

  async fixedFee(caseType: FeeInputs['caseType']) {
    const [baseFee, policy] = await Promise.all([
      this.settings.baseFee(caseType),
      this.settings.feePolicy(),
    ]);
    const inputs: FeeInputs = {
      caseType,
      baseFee,
      adValoremPercent: 0,
      adValoremCapPkr: 0,
      rateModifierPercent: 0,
    };
    const { total, lines } = calculateLedger(inputs);
    return {
      total,
      lines: lines.filter((line) => line.code !== 'MODIFIER'),
      hash: feeInputHash(inputs),
      dueDays: policy.challanDueDays,
    };
  }

  /** The caller supplies the case transaction when issuing on filing. */
  async issue(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    c: { id: string; ucn: string },
    fee: { total: Prisma.Decimal; lines: LedgerLine[]; hash: string; dueDays: number },
    meta: RequestMeta,
    payerId = user.id,
  ) {
    const created = await tx.challan.create({
      data: {
        challanNo: await nextChallanNo(tx),
        caseId: c.id,
        payerId,
        amount: fee.total,
        dueDate: new Date(todayUtc().getTime() + fee.dueDays * 86_400_000),
        ledger: fee.lines as unknown as Prisma.InputJsonValue,
        inputHash: fee.hash,
      },
    });
    await this.audit.logWithin(tx, {
      action: AuditAction.CHALLAN_GENERATED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'Challan',
      entityId: created.id,
      metadata: { ucn: c.ucn, challanNo: created.challanNo, total: fee.total.toFixed(2) },
      ...meta,
    });
    return created;
  }

  async issueOnFiling(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    c: { id: string; ucn: string; title: string; caseType: FeeInputs['caseType'] },
    fee: Awaited<ReturnType<ChallansService['fixedFee']>>,
    payerId: string | undefined,
    meta: RequestMeta,
  ) {
    const created = await this.issue(
      tx, user, c, { ...fee, hash: FIXED_FILING_PREFIX + fee.hash }, meta, payerId,
    );
    return challanView({ ...created, case: c, payments: [] });
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
    const fixed = c.filedBy.role === 'LITIGANT';
    const fee = fixed ? await this.fixedFee(c.caseType) : await this.variableFee(c);
    const { total, lines, hash } = fee;

    const result = await this.prisma.$transaction(async (tx) => {
      // One challan per case even when two requests arrive together.
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${caseId}))) AS l`;
      const existing = await tx.challan.findFirst({
        where: { caseId, status: { in: ['UNPAID', 'PAID'] } },
        orderBy: { issuedAt: 'desc' },
      });
      if (existing && (
        fixed || existing.status === 'PAID' || existing.inputHash === hash ||
        existing.inputHash.startsWith(FIXED_FILING_PREFIX)
      )) {
        return { id: existing.id, message: 'Your challan is ready.' };
      }
      if (existing) {
        // A payment session in progress pins the amount: recalculating now would let the payer settle the
        // challan at the old amount. Sessions older than PAYMENT_SESSION_MINUTES are abandoned and cancelled.
        const since = new Date(Date.now() - PAYMENT_SESSION_MINUTES * 60_000);
        await tx.payment.updateMany({
          where: { challanId: existing.id, status: 'PENDING', createdAt: { lt: since } },
          data: { status: 'CANCELLED', failureReason: 'SESSION_EXPIRED' },
        });
        const inProgress = await tx.payment.count({
          where: { challanId: existing.id, status: 'PENDING' },
        });
        if (inProgress > 0) {
          return { id: existing.id, message: 'A payment for this challan is in progress.' };
        }
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
      const created = await this.issue(tx, user, c, fee, meta);
      return { id: created.id, message: 'Challan generated.' };
    });

    const challan = await this.prisma.challan.findUniqueOrThrow({
      where: { id: result.id },
      include: challanInclude,
    });
    return { message: result.message, challan: challanView(challan) };
  }

  private async variableFee(c: {
    caseType: FeeInputs['caseType'];
    claimAmountPkr: Prisma.Decimal | null;
  }) {
    const inputs = await this.inputsFor(c);
    return {
      ...calculateLedger(inputs),
      hash: feeInputHash(inputs),
      dueDays: (await this.settings.feePolicy()).challanDueDays,
    };
  }

  async pdf(user: AuthUser, challanId: string) {
    const c = await this.prisma.challan.findFirst({
      where: { id: challanId, case: await caseScopeFor(this.prisma, user, true) },
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
