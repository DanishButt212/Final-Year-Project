import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { caseAudience, caseScopeFor } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { nextReceiptNo } from '../common/counters';
import { Messages } from '../common/messages';
import { PageQueryDto, pageMeta } from '../common/pagination';
import { CaseEventType } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizeDto, CheckoutDto } from './fees.dto';
import { receiptPdf } from './pdf';
import { pkParts } from '../common/pk-time';

export const PAYMENT_REJECTED_MESSAGE = 'Payment Unsuccessful: Gateway rejected request details.';

/** Strict gateway: only the documented test numbers are approved. Everything else is declined. */
const APPROVE_CARDS = ['4242424242424242', '5555555555554444'];
const INSUFFICIENT_FUNDS_CARD = '4000000000000002';

function brandOf(digits: string): string {
  if (digits.startsWith('4')) return 'VISA';
  if (/^5[1-5]/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return 'CARD';
}

interface Decision {
  approved: boolean;
  reason: 'APPROVED' | 'INSUFFICIENT_FUNDS' | 'INVALID_CARD' | 'EXPIRED_CARD' | 'INVALID_DETAILS';
  brand: string;
  last4: string;
}

/**
 * The simulated gateway decides in memory. The card number, expiry and CVV are read once here and never stored,
 * logged or put in an audit entry; only the brand and the last four digits leave this function.
 */
function decide(dto: AuthorizeDto): Decision {
  const digits = dto.cardNumber.replace(/\s+/g, '');
  const last4 = digits.slice(-4);
  const brand = brandOf(digits);
  const [mm, yy] = dto.expiry.split('/').map(Number);
  const now = pkParts();
  const expired = 2000 + yy < now.year || (2000 + yy === now.year && mm < now.month);
  const fail = (reason: Decision['reason']): Decision => ({
    approved: false,
    reason,
    brand,
    last4,
  });
  if (!/^\d{12,19}$/.test(digits) || dto.cardholderName.trim().length < 2)
    return fail('INVALID_DETAILS');
  if (expired) return fail('EXPIRED_CARD');
  if (digits === INSUFFICIENT_FUNDS_CARD) return fail('INSUFFICIENT_FUNDS');
  if (!APPROVE_CARDS.includes(digits)) return fail('INVALID_CARD');
  return { approved: true, reason: 'APPROVED', brand, last4 };
}

/** UC-4.2 Complete Online Payment (simulated gateway), UC-4.3 transaction log and receipts. */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async checkout(user: AuthUser, dto: CheckoutDto) {
    const challan = await this.prisma.challan.findFirst({
      where: { id: dto.challanId, case: await caseScopeFor(this.prisma, user) },
      select: { id: true, challanNo: true, amount: true, status: true },
    });
    if (!challan) throw new NotFoundException(Messages.NOT_FOUND);
    if (challan.status === 'PAID') {
      throw new ConflictException({
        code: 'ALREADY_PAID',
        message: 'This challan is already paid.',
      });
    }
    if (challan.status !== 'UNPAID') {
      throw new ConflictException({
        code: 'NOT_PAYABLE',
        message: 'This challan can no longer be paid.',
      });
    }
    const pending = await this.prisma.payment.findFirst({
      where: { challanId: challan.id, payerId: user.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const payment =
      pending ??
      (await this.prisma.payment.create({
        data: {
          challanId: challan.id,
          payerId: user.id,
          amount: challan.amount,
          method: 'MOCK_CARD',
          status: 'PENDING',
        },
      }));
    return {
      paymentId: payment.id,
      challanNo: challan.challanNo,
      amount: challan.amount.toFixed(2),
    };
  }

  async authorize(user: AuthUser, dto: AuthorizeDto, meta: RequestMeta) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, payerId: user.id },
      include: {
        challan: {
          select: { id: true, caseId: true, challanNo: true, case: { select: { ucn: true } } },
        },
      },
    });
    if (!payment) throw new NotFoundException(Messages.NOT_FOUND);
    if (payment.status !== 'PENDING') {
      throw new ConflictException({
        code: 'SESSION_CLOSED',
        message: 'This payment session is already closed. Start the payment again.',
      });
    }

    const decision = decide(dto);

    if (!decision.approved) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: decision.reason,
          cardBrand: decision.brand,
          cardLast4: decision.last4,
        },
      });
      await this.audit.log({
        action: AuditAction.PAYMENT_FAILED,
        actorId: user.id,
        actorRole: user.role,
        entity: 'Payment',
        entityId: payment.id,
        success: false,
        metadata: { challanNo: payment.challan.challanNo, reason: decision.reason },
        ...meta,
      });
      throw new HttpException({ code: 'PAYMENT_REJECTED', message: PAYMENT_REJECTED_MESSAGE }, 402);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${payment.challan.id}))) AS l`;
      // Conditional update: the challan can only go UNPAID -> PAID once.
      const flipped = await tx.challan.updateMany({
        where: { id: payment.challan.id, status: 'UNPAID' },
        data: { status: 'PAID' },
      });
      if (flipped.count !== 1) {
        throw new ConflictException({
          code: 'ALREADY_PAID',
          message: 'This challan is already paid.',
        });
      }
      const receiptNo = await nextReceiptNo(tx);
      const paidAt = new Date();
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          receiptNo,
          paidAt,
          gatewayRef: `MOCK-${randomBytes(6).toString('hex').toUpperCase()}`,
          cardBrand: decision.brand,
          cardLast4: decision.last4,
        },
      });
      await tx.caseEvent.create({
        data: {
          caseId: payment.challan.caseId,
          type: CaseEventType.PAYMENT_RECEIVED,
          description: `Court fee of PKR ${payment.amount.toFixed(2)} received (challan ${payment.challan.challanNo}, receipt ${receiptNo}).`,
          actorId: user.id,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.PAYMENT_SUCCESS,
        actorId: user.id,
        actorRole: user.role,
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          challanNo: payment.challan.challanNo,
          receiptNo,
          amount: payment.amount.toFixed(2),
          cardBrand: decision.brand,
          cardLast4: decision.last4,
        },
        ...meta,
      });
      const audience = await caseAudience(tx, payment.challan.caseId);
      await this.notifications.notifyMany(
        [...new Set([user.id, ...audience])],
        {
          type: 'PAYMENT_RECEIVED',
          title: 'Court fee received',
          body: `${payment.challan.case.ucn}: PKR ${payment.amount.toFixed(2)} paid. Receipt ${receiptNo}.`,
        },
        tx,
      );
      return {
        message: 'Payment successful.',
        paymentId: payment.id,
        receiptNo,
        amount: payment.amount.toFixed(2),
        paidAt,
      };
    });
  }

  async mine(user: AuthUser, q: PageQueryDto, includeFailed = false) {
    const where = {
      payerId: user.id,
      status: { in: includeFailed ? (['SUCCESS', 'FAILED'] as const).slice() : ['SUCCESS' as const] },
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          challan: { select: { challanNo: true, caseId: true, case: { select: { ucn: true } } } },
        },
      }),
    ]);
    return {
      data: rows.map((p) => ({
        id: p.id,
        date: p.paidAt ?? p.createdAt,
        caseId: p.challan.caseId,
        ucn: p.challan.case.ucn,
        challanNo: p.challan.challanNo,
        amount: p.amount.toFixed(2),
        status: p.status,
        receiptNo: p.receiptNo,
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  async receipt(user: AuthUser, paymentId: string) {
    const p = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        status: 'SUCCESS',
        challan: { case: await caseScopeFor(this.prisma, user) },
      },
      include: {
        payer: { select: { firstName: true, lastName: true } },
        challan: { select: { challanNo: true, case: { select: { ucn: true, title: true } } } },
      },
    });
    if (!p || !p.receiptNo || !p.paidAt) throw new NotFoundException(Messages.NOT_FOUND);
    return receiptPdf({
      receiptNo: p.receiptNo,
      challanNo: p.challan.challanNo,
      ucn: p.challan.case.ucn,
      title: p.challan.case.title,
      payerName: `${p.payer.firstName} ${p.payer.lastName}`,
      amount: p.amount.toFixed(2),
      paidAt: p.paidAt,
      method: `Demo gateway${p.cardBrand ? ` (${p.cardBrand} ending ${p.cardLast4})` : ''}, simulated`,
      gatewayRef: p.gatewayRef,
    });
  }
}
