import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { nextSequence } from '../common/counters';
import { Messages } from '../common/messages';
import { pageMeta } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChamberContext } from './chamber.guard';
import {
  BillableQueryDto,
  ClientListQueryDto,
  CreateBillableDto,
  CreateClientDto,
  CreateExpenseDto,
  DepositDto,
  UpdateChamberProfileDto,
  UpdateClientDto,
} from './chamber.dto';
import {
  dateOnly,
  dec,
  isoDay,
  karachiDate,
  maskCnic,
  money,
  monthStart,
  retainerStatus,
} from './chamber.util';

export const CHAMBER_MESSAGES = {
  PROFILE_UPDATED: 'Corporate chamber identity files revised successfully.',
  CLIENT_CREATED: 'New client profile cataloged inside chamber records.',
  CLIENT_DUPLICATE: 'Duplicate profile entry detected for this client ID.',
  BILLABLE_RECORDED: 'Billable time unit recorded.',
  DEPOSIT_RECORDED: 'Retainer deposit recorded.',
  ALERT_ISSUED: 'Low balance alert issued to the client.',
  EXPENSE_RECORDED: 'Chamber expense recorded.',
};

const duplicateClient = () =>
  new ConflictException({
    code: 'DUPLICATE_CLIENT',
    message: CHAMBER_MESSAGES.CLIENT_DUPLICATE,
    details: [{ field: 'cnic', messages: [CHAMBER_MESSAGES.CLIENT_DUPLICATE] }],
  });

/** Chamber portal for a verified lawyer. Every query is scoped to ctx.lawyerId (the chamber silo). */
@Injectable()
export class ChamberService {
  private readonly logger = new Logger('MockDelivery');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private log(
    ctx: ChamberContext,
    action: string,
    entity: string,
    entityId: string,
    meta: RequestMeta,
    metadata?: Prisma.InputJsonValue,
    db?: Prisma.TransactionClient,
  ) {
    const entry = {
      action,
      actorId: ctx.userId,
      actorRole: 'LAWYER' as const,
      entity,
      entityId,
      metadata: { chamber: ctx.chamber.chamberCode, ...((metadata as object) ?? {}) },
      ...meta,
    };
    return db ? this.audit.logWithin(db, entry) : this.audit.log(entry);
  }

  // ------------------------------------------------------------ profile

  private profileView(c: ChamberContext['chamber']) {
    return {
      id: c.id,
      chamberCode: c.chamberCode,
      name: c.name,
      officeAddress: c.officeAddress,
      partnerNames: c.partnerNames,
      barMembershipIds: c.barMembershipIds,
      practiceVerticals: c.practiceVerticals,
      phone: c.phone,
      email: c.email,
      licenseStatus: c.licenseStatus,
      defaultHourlyRatePkr: money(c.defaultHourlyRatePkr),
      lowBalanceThresholdPkr: money(c.lowBalanceThresholdPkr),
    };
  }

  async getProfile(ctx: ChamberContext) {
    const fresh = await this.prisma.chamberProfile.findUniqueOrThrow({
      where: { id: ctx.chamber.id },
    });
    const bar = await this.prisma.lawyerProfile.findUnique({
      where: { id: ctx.lawyerId },
      select: { barNumber: true, user: { select: { firstName: true, lastName: true } } },
    });
    return {
      ...this.profileView(fresh),
      lawyerName: bar ? `${bar.user.firstName} ${bar.user.lastName}` : null,
      barNumber: bar?.barNumber ?? null,
    };
  }

  async updateProfile(ctx: ChamberContext, dto: UpdateChamberProfileDto, meta: RequestMeta) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.chamberProfile.update({
        where: { id: ctx.chamber.id },
        data: {
          name: dto.name,
          officeAddress: dto.officeAddress,
          partnerNames: dto.partnerNames,
          barMembershipIds: dto.barMembershipIds,
          practiceVerticals: dto.practiceVerticals,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          defaultHourlyRatePkr: dto.defaultHourlyRatePkr.toFixed(2),
          lowBalanceThresholdPkr: dto.lowBalanceThresholdPkr.toFixed(2),
        },
      });
      await this.log(
        ctx,
        AuditAction.CHAMBER_PROFILE_UPDATED,
        'ChamberProfile',
        row.id,
        meta,
        undefined,
        tx,
      );
      return row;
    });
    return { message: CHAMBER_MESSAGES.PROFILE_UPDATED, profile: this.profileView(updated) };
  }

  // ------------------------------------------------------------ retainer helpers

  /** Deposits and deductions per client, always derived from the transactions. */
  private async totals(
    db: Prisma.TransactionClient | PrismaService,
    lawyerId: string,
    clientId?: string,
  ) {
    const rows = await db.retainerTransaction.groupBy({
      by: ['clientId', 'type'],
      where: { client: { lawyerId }, ...(clientId ? { clientId } : {}) },
      _sum: { amount: true },
    });
    const map = new Map<string, { deposits: Prisma.Decimal; deductions: Prisma.Decimal }>();
    for (const r of rows) {
      const t = map.get(r.clientId) ?? { deposits: dec(0), deductions: dec(0) };
      const v = r._sum.amount ?? dec(0);
      if (r.type === 'DEPOSIT') t.deposits = t.deposits.plus(v);
      else t.deductions = t.deductions.plus(v); // DEDUCTION and REFUND both leave the account
      map.set(r.clientId, t);
    }
    return map;
  }

  private summarize(
    t: { deposits: Prisma.Decimal; deductions: Prisma.Decimal } | undefined,
    threshold: Prisma.Decimal,
  ) {
    const deposits = t?.deposits ?? dec(0);
    const deductions = t?.deductions ?? dec(0);
    const balance = deposits.minus(deductions);
    return {
      totalDeposits: money(deposits),
      totalDeductions: money(deductions),
      balance: money(balance),
      status: retainerStatus(balance, threshold),
    };
  }

  /** After a balance change: tell the lawyer once when a client drops below the threshold. */
  private async checkLowBalance(
    tx: Prisma.TransactionClient,
    ctx: ChamberContext,
    client: { id: string; name: string; clientCode: string },
  ) {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${ctx.chamber.id}))) AS l`;
    const chamber = await tx.chamberProfile.findUniqueOrThrow({ where: { id: ctx.chamber.id } });
    const t = (await this.totals(tx, ctx.lawyerId, client.id)).get(client.id);
    const s = this.summarize(t, chamber.lowBalanceThresholdPkr);
    const notified = chamber.lowBalanceNotifiedIds.includes(client.id);
    if (s.status !== 'OK' && !notified) {
      await tx.chamberProfile.update({
        where: { id: chamber.id },
        data: { lowBalanceNotifiedIds: [...chamber.lowBalanceNotifiedIds, client.id] },
      });
      await this.notifications.notify(
        ctx.userId,
        {
          type: 'CHAMBER_LOW_BALANCE',
          title: 'Low retainer balance',
          body: `${client.name} (${client.clientCode}) is ${s.status === 'OVERDRAWN' ? 'overdrawn' : 'below the threshold'}: balance PKR ${s.balance}.`,
        },
        tx,
      );
    } else if (s.status === 'OK' && notified) {
      await tx.chamberProfile.update({
        where: { id: chamber.id },
        data: {
          lowBalanceNotifiedIds: chamber.lowBalanceNotifiedIds.filter((x) => x !== client.id),
        },
      });
    }
  }

  private async clientOrThrow(ctx: ChamberContext, id: string) {
    const client = await this.prisma.chamberClient.findFirst({
      where: { id, lawyerId: ctx.lawyerId },
    });
    if (!client) throw new NotFoundException(Messages.NOT_FOUND);
    return client;
  }

  // ------------------------------------------------------------ clients

  async listClients(ctx: ChamberContext, q: ClientListQueryDto) {
    const where: Prisma.ChamberClientWhereInput = {
      lawyerId: ctx.lawyerId,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { clientCode: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [total, rows, totals] = await Promise.all([
      this.prisma.chamberClient.count({ where }),
      this.prisma.chamberClient.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.totals(this.prisma, ctx.lawyerId),
    ]);
    return {
      data: rows.map((c) => ({
        id: c.id,
        clientCode: c.clientCode,
        name: c.name,
        cnic: maskCnic(c.cnic),
        phone: c.phone,
        caseType: c.caseType,
        onboardedOn: c.onboardedOn,
        ...this.summarize(totals.get(c.id), ctx.chamber.lowBalanceThresholdPkr),
      })),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  /** Light list for selects (no balances, no CNIC). */
  async clientOptions(ctx: ChamberContext) {
    const rows = await this.prisma.chamberClient.findMany({
      where: { lawyerId: ctx.lawyerId },
      orderBy: { name: 'asc' },
      select: { id: true, clientCode: true, name: true },
      take: 500,
    });
    return rows;
  }

  async createClient(ctx: ChamberContext, dto: CreateClientDto, meta: RequestMeta) {
    const exists = await this.prisma.chamberClient.findFirst({
      where: { lawyerId: ctx.lawyerId, cnic: dto.cnic },
      select: { id: true },
    });
    if (exists) throw duplicateClient();
    try {
      const client = await this.prisma.$transaction(async (tx) => {
        const n = await nextSequence(tx, `CL:${ctx.lawyerId}`, 0);
        const row = await tx.chamberClient.create({
          data: {
            lawyerId: ctx.lawyerId,
            clientCode: `CL-${String(n).padStart(6, '0')}`,
            name: dto.name,
            cnic: dto.cnic,
            phone: dto.phone,
            caseType: dto.caseType,
            onboardedOn: dateOnly(dto.onboardedOn ?? karachiDate()),
          },
        });
        await this.log(
          ctx,
          AuditAction.CHAMBER_CLIENT_CREATED,
          'ChamberClient',
          row.id,
          meta,
          { clientCode: row.clientCode },
          tx,
        );
        return row;
      });
      return {
        message: CHAMBER_MESSAGES.CLIENT_CREATED,
        client: { id: client.id, clientCode: client.clientCode, name: client.name },
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw duplicateClient();
      throw e;
    }
  }

  async clientDetail(ctx: ChamberContext, id: string) {
    const c = await this.clientOrThrow(ctx, id);
    const [billable, transactions, totals, alerts] = await Promise.all([
      this.prisma.billableEntry.findMany({
        where: { clientId: id, lawyerId: ctx.lawyerId },
        orderBy: [{ workedOn: 'desc' }, { createdAt: 'desc' }],
        take: 200,
        include: { case: { select: { id: true, ucn: true, title: true } } },
      }),
      this.prisma.retainerTransaction.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.totals(this.prisma, ctx.lawyerId, id),
      this.prisma.chamberAlertLog.findMany({
        where: { clientId: id },
        orderBy: { sentAt: 'desc' },
        take: 5,
      }),
    ]);
    const cases = new Map<string, { id: string; ucn: string; title: string }>();
    for (const b of billable) if (b.case) cases.set(b.case.id, b.case);
    const invoiceTotal = billable.reduce((a, b) => a.plus(b.amountPkr), dec(0));
    return {
      id: c.id,
      clientCode: c.clientCode,
      name: c.name,
      cnic: c.cnic,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      caseType: c.caseType,
      onboardedOn: c.onboardedOn,
      retainer: this.summarize(totals.get(id), ctx.chamber.lowBalanceThresholdPkr),
      invoiceTotal: money(invoiceTotal),
      linkedCases: [...cases.values()],
      billable: billable.map((b) => ({
        id: b.id,
        workedOn: b.workedOn,
        hours: b.hours.toString(),
        hourlyRate: money(b.hourlyRate),
        amount: money(b.amountPkr),
        description: b.description,
        ucn: b.case?.ucn ?? null,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: money(t.amount),
        note: t.note,
        reference: t.reference,
        createdAt: t.createdAt,
      })),
      alerts: alerts.map((a) => ({ id: a.id, sentAt: a.sentAt, balance: money(a.balancePkr) })),
    };
  }

  async updateClient(ctx: ChamberContext, id: string, dto: UpdateClientDto, meta: RequestMeta) {
    await this.clientOrThrow(ctx, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.chamberClient.update({
        where: { id },
        data: {
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.caseType !== undefined ? { caseType: dto.caseType } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      await this.log(
        ctx,
        AuditAction.CHAMBER_CLIENT_UPDATED,
        'ChamberClient',
        id,
        meta,
        undefined,
        tx,
      );
    });
    return { message: 'Client profile updated.' };
  }

  // ------------------------------------------------------------ billable hours

  async createBillable(ctx: ChamberContext, dto: CreateBillableDto, meta: RequestMeta) {
    const client = await this.clientOrThrow(ctx, dto.clientId);
    if (dto.caseId) {
      const linked = await this.prisma.case.findFirst({
        where: { id: dto.caseId, parties: { some: { lawyerId: ctx.lawyerId } } },
        select: { id: true },
      });
      if (!linked) throw new NotFoundException(Messages.NOT_FOUND);
    }
    const rate = dec(dto.hourlyRate ?? ctx.chamber.defaultHourlyRatePkr);
    const hours = dec(dto.hours);
    const amount = hours.mul(rate).toDecimalPlaces(2);
    const charge = dto.chargeAgainstRetainer ?? true;

    const entry = await this.prisma.$transaction(async (tx) => {
      const row = await tx.billableEntry.create({
        data: {
          lawyerId: ctx.lawyerId,
          clientId: client.id,
          caseId: dto.caseId,
          workedOn: dateOnly(dto.workedOn ?? karachiDate()),
          hours,
          hourlyRate: rate,
          amountPkr: amount,
          description: dto.notes,
        },
      });
      if (charge) {
        await tx.retainerTransaction.create({
          data: {
            clientId: client.id,
            type: 'DEDUCTION',
            amount,
            billableEntryId: row.id,
            note: dto.notes.slice(0, 200),
          },
        });
        await this.checkLowBalance(tx, ctx, client);
      }
      await this.log(
        ctx,
        AuditAction.BILLABLE_RECORDED,
        'BillableEntry',
        row.id,
        meta,
        {
          hours: hours.toString(),
          amount: amount.toString(),
          charged: charge,
        },
        tx,
      );
      return row;
    });
    return {
      message: CHAMBER_MESSAGES.BILLABLE_RECORDED,
      entry: { id: entry.id, hours: entry.hours.toString(), amount: money(entry.amountPkr) },
    };
  }

  async listBillable(ctx: ChamberContext, q: BillableQueryDto) {
    const where: Prisma.BillableEntryWhereInput = {
      lawyerId: ctx.lawyerId,
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.from || q.to
        ? {
            workedOn: {
              ...(q.from ? { gte: dateOnly(q.from) } : {}),
              ...(q.to ? { lte: dateOnly(q.to) } : {}),
            },
          }
        : {}),
    };
    const [total, agg, rows] = await Promise.all([
      this.prisma.billableEntry.count({ where }),
      this.prisma.billableEntry.aggregate({ where, _sum: { hours: true, amountPkr: true } }),
      this.prisma.billableEntry.findMany({
        where,
        orderBy: [{ workedOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          client: { select: { name: true, clientCode: true } },
          case: { select: { ucn: true } },
        },
      }),
    ]);
    return {
      data: rows.map((b) => ({
        id: b.id,
        workedOn: b.workedOn,
        clientId: b.clientId,
        clientName: b.client.name,
        clientCode: b.client.clientCode,
        hours: b.hours.toString(),
        hourlyRate: money(b.hourlyRate),
        amount: money(b.amountPkr),
        description: b.description,
        ucn: b.case?.ucn ?? null,
      })),
      totals: {
        hours: (agg._sum.hours ?? dec(0)).toString(),
        amount: money(agg._sum.amountPkr ?? dec(0)),
      },
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  // ------------------------------------------------------------ retainer

  async deposit(ctx: ChamberContext, clientId: string, dto: DepositDto, meta: RequestMeta) {
    const client = await this.clientOrThrow(ctx, clientId);
    const amount = dec(dto.amount).toDecimalPlaces(2);
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.retainerTransaction.create({
        data: {
          clientId,
          type: 'DEPOSIT',
          amount,
          reference: dto.reference,
          note: dto.reference ? `Deposit (${dto.reference})` : 'Retainer deposit',
        },
      });
      await this.checkLowBalance(tx, ctx, client);
      await this.log(
        ctx,
        AuditAction.RETAINER_DEPOSIT,
        'RetainerTransaction',
        row.id,
        meta,
        {
          amount: amount.toString(),
        },
        tx,
      );
    });
    return { message: CHAMBER_MESSAGES.DEPOSIT_RECORDED };
  }

  async retainerSummary(ctx: ChamberContext) {
    const [clients, totals, alerts] = await Promise.all([
      this.prisma.chamberClient.findMany({
        where: { lawyerId: ctx.lawyerId },
        orderBy: { name: 'asc' },
      }),
      this.totals(this.prisma, ctx.lawyerId),
      this.prisma.chamberAlertLog.groupBy({
        by: ['clientId'],
        where: { lawyerId: ctx.lawyerId },
        _max: { sentAt: true },
      }),
    ]);
    const lastAlert = new Map(alerts.map((a) => [a.clientId, a._max.sentAt]));
    const rows = clients.map((c) => ({
      clientId: c.id,
      clientCode: c.clientCode,
      name: c.name,
      ...this.summarize(totals.get(c.id), ctx.chamber.lowBalanceThresholdPkr),
      lastAlertAt: lastAlert.get(c.id) ?? null,
    }));
    const sum = (k: 'totalDeposits' | 'totalDeductions' | 'balance') =>
      money(rows.reduce((a, r) => a.plus(r[k]), dec(0)));
    return {
      thresholdPkr: money(ctx.chamber.lowBalanceThresholdPkr),
      data: rows,
      totals: {
        deposits: sum('totalDeposits'),
        deductions: sum('totalDeductions'),
        balance: sum('balance'),
      },
    };
  }

  /** Mock SMS to the client's phone. Never includes the CNIC. */
  async issueLowBalanceAlert(ctx: ChamberContext, clientId: string, meta: RequestMeta) {
    const client = await this.clientOrThrow(ctx, clientId);
    const t = (await this.totals(this.prisma, ctx.lawyerId, clientId)).get(clientId);
    const s = this.summarize(t, ctx.chamber.lowBalanceThresholdPkr);
    if (s.status === 'OK') {
      throw new ConflictException({
        code: 'BALANCE_ABOVE_THRESHOLD',
        message: 'This client retainer is above the low balance threshold.',
      });
    }
    this.logger.log(
      `[MOCK SMS] to=${client.phone ?? 'no phone on file'} Dear ${client.name}, your retainer balance with ${ctx.chamber.name} is PKR ${s.balance}. Please top up.`,
    );
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.chamberAlertLog.create({
        data: { lawyerId: ctx.lawyerId, clientId, balancePkr: s.balance },
      });
      await this.log(
        ctx,
        AuditAction.LOW_BALANCE_ALERT,
        'ChamberAlertLog',
        row.id,
        meta,
        {
          clientCode: client.clientCode,
          balance: s.balance,
        },
        tx,
      );
    });
    return { message: CHAMBER_MESSAGES.ALERT_ISSUED };
  }

  // ------------------------------------------------------------ expenses

  async createExpense(ctx: ChamberContext, dto: CreateExpenseDto, meta: RequestMeta) {
    const row = await this.prisma.$transaction(async (tx) => {
      const e = await tx.chamberExpense.create({
        data: {
          lawyerId: ctx.lawyerId,
          category: dto.category,
          amount: dec(dto.amount).toDecimalPlaces(2),
          spentOn: dateOnly(dto.spentOn),
          description: dto.note,
        },
      });
      await this.log(
        ctx,
        AuditAction.CHAMBER_EXPENSE,
        'ChamberExpense',
        e.id,
        meta,
        { category: dto.category },
        tx,
      );
      return e;
    });
    return { message: CHAMBER_MESSAGES.EXPENSE_RECORDED, id: row.id };
  }

  async listExpenses(ctx: ChamberContext, q: { page: number; limit: number }) {
    const where = { lawyerId: ctx.lawyerId };
    const month = dateOnly(monthStart(karachiDate()));
    const [total, all, thisMonth, rows] = await Promise.all([
      this.prisma.chamberExpense.count({ where }),
      this.prisma.chamberExpense.aggregate({ where, _sum: { amount: true } }),
      this.prisma.chamberExpense.aggregate({
        where: { ...where, spentOn: { gte: month } },
        _sum: { amount: true },
      }),
      this.prisma.chamberExpense.findMany({
        where,
        orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return {
      data: rows.map((e) => ({
        id: e.id,
        spentOn: e.spentOn,
        category: e.category,
        amount: money(e.amount),
        note: e.description,
      })),
      totals: {
        all: money(all._sum.amount ?? dec(0)),
        thisMonth: money(thisMonth._sum.amount ?? dec(0)),
      },
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  // ------------------------------------------------------------ cases and dashboard

  /** Cases the lawyer appears in (for billable links and research logs). */
  async myCases(ctx: ChamberContext) {
    return this.prisma.case.findMany({
      where: { parties: { some: { lawyerId: ctx.lawyerId } }, status: { not: 'DRAFT' } },
      orderBy: { filingDate: 'desc' },
      select: { id: true, ucn: true, title: true },
      take: 200,
    });
  }

  async dashboard(ctx: ChamberContext) {
    const today = karachiDate();
    const monthFrom = dateOnly(monthStart(today));
    const weekStart = new Date(dateOnly(today));
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7) - 7 * 7);

    const [
      clients,
      billedMonth,
      expensesMonth,
      totals,
      interns,
      pending,
      hearings,
      recent,
      clientRows,
    ] = await Promise.all([
      this.prisma.chamberClient.count({ where: { lawyerId: ctx.lawyerId } }),
      this.prisma.billableEntry.aggregate({
        where: { lawyerId: ctx.lawyerId, workedOn: { gte: monthFrom } },
        _sum: { amountPkr: true, hours: true },
      }),
      this.prisma.chamberExpense.aggregate({
        where: { lawyerId: ctx.lawyerId, spentOn: { gte: monthFrom } },
        _sum: { amount: true },
      }),
      this.totals(this.prisma, ctx.lawyerId),
      this.prisma.internProfile.count({
        where: { supervisorId: ctx.lawyerId, user: { status: 'ACTIVE' } },
      }),
      this.prisma.internDiaryEntry.count({
        where: { intern: { supervisorId: ctx.lawyerId }, reviewStatus: 'SUBMITTED' },
      }),
      this.prisma.hearing.findMany({
        where: {
          status: { not: 'CANCELLED' },
          date: { gte: dateOnly(today) },
          case: { parties: { some: { lawyerId: ctx.lawyerId } } },
        },
        orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
        take: 5,
        select: {
          id: true,
          date: true,
          startTime: true,
          courtroom: { select: { name: true } },
          case: { select: { id: true, ucn: true, title: true } },
        },
      }),
      this.prisma.billableEntry.findMany({
        where: { lawyerId: ctx.lawyerId, workedOn: { gte: weekStart } },
        select: { workedOn: true, amountPkr: true },
      }),
      this.prisma.chamberClient.findMany({
        where: { lawyerId: ctx.lawyerId },
        select: { id: true, clientCode: true, name: true },
      }),
    ]);

    let held = dec(0);
    const low: { id: string; clientCode: string; name: string; balance: string; status: string }[] =
      [];
    for (const c of clientRows) {
      const s = this.summarize(totals.get(c.id), ctx.chamber.lowBalanceThresholdPkr);
      if (!dec(s.balance).isNegative()) held = held.plus(s.balance);
      if (s.status !== 'OK') low.push({ ...c, balance: s.balance, status: s.status });
    }
    low.sort((a, b) => Number(a.balance) - Number(b.balance));

    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(weekStart);
      start.setUTCDate(start.getUTCDate() + i * 7);
      return { weekStart: isoDay(start), amount: dec(0) };
    });
    for (const r of recent) {
      const idx = Math.floor((r.workedOn.getTime() - weekStart.getTime()) / (7 * 86_400_000));
      if (idx >= 0 && idx < 8) weeks[idx].amount = weeks[idx].amount.plus(r.amountPkr);
    }

    return {
      chamber: { name: ctx.chamber.name, chamberCode: ctx.chamber.chamberCode },
      clients,
      billedThisMonth: money(billedMonth._sum.amountPkr ?? dec(0)),
      hoursThisMonth: (billedMonth._sum.hours ?? dec(0)).toString(),
      expensesThisMonth: money(expensesMonth._sum.amount ?? dec(0)),
      retainerHeld: money(held),
      lowBalanceCount: low.length,
      lowBalanceClients: low.slice(0, 5),
      interns,
      pendingReviews: pending,
      nextHearings: hearings.map((h) => ({
        id: h.id,
        date: h.date,
        startTime: h.startTime,
        courtroom: h.courtroom?.name ?? null,
        caseId: h.case.id,
        ucn: h.case.ucn,
        title: h.case.title,
      })),
      weeklyBilled: weeks.map((w) => ({ weekStart: w.weekStart, amount: money(w.amount) })),
    };
  }
}
