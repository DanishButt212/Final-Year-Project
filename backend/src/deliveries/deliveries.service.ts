import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RequestMeta } from '../admin/constants';
import { AuditService } from '../audit/audit.service';
import { sanitizeFileName, startsWithPdfMagic } from '../cases/pdf-files';
import type { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { pkToday } from '../common/pk-time';
import { EvidenceCryptoService } from '../evidence/evidence-crypto.service';
import { DeliveryReviewAction, DeliveryStatus, Prisma } from '../generated/prisma/client';
import { notice } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { isImage, MAX_PROFILE_PHOTO_BYTES, screeningFailed } from '../summons/summons.files';
import { AssignDeliveryDto, ReportDeliveryDto, ReviewDeliveryDto } from './deliveries.dto';

const name = { select: { firstName: true, lastName: true } } as const;
const publishedActions: DeliveryReviewAction[] = ['ACCEPT', 'RETRY', 'FORWARD'];
const publishedAttempt = { reviews: { some: { action: { in: publishedActions } } } };
const deliveryInclude = () =>
  ({
    case: {
      select: {
        ucn: true,
        title: true,
        judgeId: true,
        hearings: {
          where: { date: { gte: pkToday() }, status: 'SCHEDULED' },
          orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
          take: 1,
          select: { date: true },
        },
      },
    },
    document: { select: { originalName: true, filePath: true } },
    hearing: { select: { date: true, status: true } },
    server: name,
    attempts: {
      orderBy: { number: 'desc' },
      include: {
        server: name,
        reviews: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { actor: name } },
      },
    },
  }) satisfies Prisma.DocumentDeliveryInclude;
type DeliveryRow = Prisma.DocumentDeliveryGetPayload<{
  include: ReturnType<typeof deliveryInclude>;
}>;
const calendarDay = (date: Date) => date.toISOString().slice(0, 10);
const notFound = () => new NotFoundException(Messages.NOT_FOUND);
const changed = () => new ConflictException('The delivery has changed. Refresh and try again.');

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: EvidenceCryptoService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  private scope(user: AuthUser): Prisma.DocumentDeliveryWhereInput {
    switch (user.role) {
      case 'ADMIN':
        return {};
      case 'PROCESS_SERVER':
        return { serverId: user.id };
      case 'JUDGE':
        return { case: { judgeId: user.id }, attempts: { some: publishedAttempt } };
      default:
        return { id: { in: [] } };
    }
  }

  private async own(user: AuthUser, id: string) {
    const row = await this.prisma.documentDelivery.findFirst({
      where: { id, ...this.scope(user) },
      include: deliveryInclude(),
    });
    if (!row) throw notFound();
    return row;
  }

  async list(user: AuthUser, caseId?: string) {
    if (caseId) {
      const allowed = await this.prisma.case.findFirst({
        where: { id: caseId, ...(user.role === 'JUDGE' ? { judgeId: user.id } : {}) },
        select: { id: true },
      });
      if (!allowed) throw notFound();
    }
    const rows = await this.prisma.documentDelivery.findMany({
      where: { ...this.scope(user), caseId },
      include: deliveryInclude(),
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((d) => this.view(user, d));
  }

  private view(user: AuthUser, d: DeliveryRow) {
    const attempts = d.attempts.filter((a) =>
      user.role === 'JUDGE'
        ? a.reviews.some((r) => publishedActions.includes(r.action))
        : user.role !== 'PROCESS_SERVER' || a.serverId === user.id,
    );
    const hearingDate =
      d.hearing && d.hearing.status !== 'CANCELLED' ? d.hearing.date : d.case.hearings[0]?.date;
    return {
      id: d.id,
      caseId: d.caseId,
      ucn: d.case.ucn,
      caseTitle: d.case.title,
      documentName: d.document.originalName,
      recipientName: d.recipientName,
      address: user.role === 'JUDGE' ? attempts[0]?.address : d.address,
      serverId: d.serverId,
      server: user.role === 'JUDGE' ? attempts[0]?.server : d.server,
      version: d.version,
      dueDate: calendarDay(d.dueDate),
      hearingDate: hearingDate ? calendarDay(hearingDate) : null,
      status: user.role === 'JUDGE' ? 'REVIEWED' : d.status,
      attempts: attempts.map((a) => ({
        id: a.id,
        number: a.number,
        address: a.address,
        server: a.server,
        occurredAt: a.occurredAt,
        reportedAt: a.reportedAt,
        outcome: a.outcome,
        remarks: a.remarks,
        receivedBy: a.receivedBy,
        reason: a.reason,
        acknowledgmentType: a.ackType,
        reviews: a.reviews.map((r) => ({
          id: r.id,
          action: r.action,
          note: r.note,
          actor: r.actor,
          createdAt: r.createdAt,
        })),
      })),
    };
  }

  async options(caseId: string) {
    const today = pkToday();
    const [record, policy] = await Promise.all([
      this.prisma.case.findUnique({
        where: { id: caseId },
        select: {
          documents: { select: { id: true, originalName: true }, orderBy: { createdAt: 'desc' } },
          parties: {
            select: { id: true, name: true, address: true, role: true },
            orderBy: [{ role: 'asc' }, { position: 'asc' }],
          },
          hearings: {
            where: { status: 'SCHEDULED', date: { gte: today } },
            orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
            take: 1,
            select: { id: true, date: true },
          },
        },
      }),
      this.settings.summonsPolicy(),
    ]);
    if (!record) throw notFound();
    const due = new Date(today.getTime() + policy.defaultDueDays * 86_400_000);
    return {
      documents: record.documents,
      recipients: record.parties,
      hearingDate: record.hearings[0] ? calendarDay(record.hearings[0].date) : null,
      hearingId: record.hearings[0]?.id,
      dueDate: calendarDay(due),
    };
  }

  async assign(user: AuthUser, caseId: string, dto: AssignDeliveryDto, meta: RequestMeta) {
    const options = await this.options(caseId);
    const recipient = options.recipients.find((p) => p.id === dto.recipientId);
    if (!recipient || !options.documents.some((d) => d.id === dto.documentId)) throw notFound();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.activeServer(tx, dto.serverId);
        const row = await tx.documentDelivery.create({
          data: {
            caseId,
            documentId: dto.documentId,
            recipientId: recipient.id,
            recipientName: recipient.name,
            address: dto.address,
            dueDate: new Date(dto.dueDate ?? options.dueDate),
            serverId: dto.serverId,
            assignedById: user.id,
            hearingId: options.hearingId,
          },
          select: { id: true },
        });
        await this.log(tx, user, row.id, 'DELIVERY_ASSIGNED', meta, { serverId: dto.serverId });
        await this.notify(
          tx,
          dto.serverId,
          'Document delivery assigned',
          'A case document is ready for delivery.',
        );
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This document already has a delivery for this recipient.');
      }
      throw error;
    }
  }

  async start(user: AuthUser, id: string, version: number, meta: RequestMeta) {
    await this.own(user, id);
    await this.prisma.$transaction(async (tx) => {
      await this.update(tx, user, id, version, ['ASSIGNED'], { status: 'OUT_FOR_DELIVERY' });
      await this.log(tx, user, id, 'DELIVERY_STARTED', meta);
    });
  }

  async report(
    user: AuthUser,
    id: string,
    dto: ReportDeliveryDto,
    file: Express.Multer.File | undefined,
    meta: RequestMeta,
  ) {
    const d = await this.own(user, id);
    if (d.status !== 'OUT_FOR_DELIVERY' || d.version !== dto.version) throw changed();
    const delivered = dto.outcome === 'DELIVERED';
    if (delivered ? !dto.receivedBy || dto.reason : !dto.reason || dto.receivedBy || file) {
      throw new BadRequestException(
        'Enter who received the document for delivery or a reason for an unsuccessful attempt.',
      );
    }
    const occurredAt = new Date(dto.occurredAt);
    if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now()) {
      throw new BadRequestException('The attempt date and time must not be in the future.');
    }
    const ackType = file ? await this.acknowledgmentType(file) : null;
    const ackKey = file ? `deliveries/${id}/${randomUUID()}` : null;
    try {
      const proof = file && ackKey ? await this.crypto.encryptToStorage(file.path, ackKey) : null;
      await this.prisma.$transaction(async (tx) => {
        await this.update(tx, user, id, dto.version, ['OUT_FOR_DELIVERY'], { status: 'REPORTED' });
        const attempt = await tx.documentDeliveryAttempt.create({
          data: {
            deliveryId: id,
            number: (d.attempts[0]?.number ?? 0) + 1,
            serverId: user.id,
            address: d.address,
            occurredAt,
            outcome: dto.outcome,
            remarks: dto.remarks,
            receivedBy: delivered ? dto.receivedBy : null,
            reason: delivered ? null : dto.reason,
            ackKey,
            ackIv: proof?.iv,
            ackTag: proof?.authTag,
            ackType,
          },
          select: { id: true },
        });
        await this.log(tx, user, id, 'DELIVERY_REPORTED', meta, {
          attemptId: attempt.id,
          outcome: dto.outcome,
        });
        await this.notify(
          tx,
          d.assignedById,
          'Delivery report submitted',
          `A delivery report for ${d.case.ucn} is ready for review.`,
        );
      });
    } catch (error) {
      if (ackKey) await this.storage.remove(ackKey).catch(() => undefined);
      throw error;
    }
  }

  async reply(user: AuthUser, id: string, version: number, note: string, meta: RequestMeta) {
    const d = await this.own(user, id);
    const attempt = d.attempts[0];
    if (!attempt || attempt.serverId !== user.id) throw changed();
    await this.prisma.$transaction(async (tx) => {
      await this.update(tx, user, id, version, ['CLARIFICATION_REQUESTED'], { status: 'REPORTED' });
      await tx.documentDeliveryReview.create({
        data: { attemptId: attempt.id, actorId: user.id, action: 'CLARIFICATION_REPLY', note },
      });
      await this.log(tx, user, id, 'DELIVERY_CLARIFIED', meta, { attemptId: attempt.id });
      await this.notify(
        tx,
        d.assignedById,
        'Clarification received',
        `A delivery report for ${d.case.ucn} has been clarified.`,
      );
    });
  }

  async review(user: AuthUser, id: string, dto: ReviewDeliveryDto, meta: RequestMeta) {
    const d = await this.own(user, id);
    const attempt = d.attempts[0];
    if (!attempt || dto.version !== d.version) throw changed();
    if (dto.action === 'REQUEST_CLARIFICATION' && !dto.note) {
      throw new BadRequestException('Enter the clarification requested.');
    }
    if (
      dto.action === 'FORWARD' &&
      (!d.case.judgeId || attempt.reviews.some((r) => r.action === 'FORWARD'))
    ) {
      throw new ConflictException(
        'Assign a judge before forwarding, and forward each report only once.',
      );
    }
    const retry = dto.action === 'RETRY';
    const serverId = retry ? (dto.serverId ?? d.serverId) : d.serverId;
    const status: Record<ReviewDeliveryDto['action'], DeliveryStatus> = {
      ACCEPT: 'REVIEWED',
      REQUEST_CLARIFICATION: 'CLARIFICATION_REQUESTED',
      RETRY: 'ASSIGNED',
      FORWARD: 'REVIEWED',
    };
    const allowed: Record<ReviewDeliveryDto['action'], DeliveryStatus[]> = {
      ACCEPT: ['REPORTED'],
      REQUEST_CLARIFICATION: ['REPORTED'],
      RETRY: ['REPORTED', 'REVIEWED', 'CLARIFICATION_REQUESTED'],
      FORWARD: ['REVIEWED'],
    };
    await this.prisma.$transaction(async (tx) => {
      if (retry) await this.activeServer(tx, serverId);
      await this.update(tx, user, id, dto.version, allowed[dto.action], {
        status: status[dto.action],
        ...(retry
          ? {
              serverId,
              assignedById: user.id,
              address: dto.address ?? d.address,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : d.dueDate,
            }
          : {}),
      });
      await tx.documentDeliveryReview.create({
        data: { attemptId: attempt.id, actorId: user.id, action: dto.action, note: dto.note },
      });
      await this.log(tx, user, id, `DELIVERY_${dto.action}`, meta, {
        attemptId: attempt.id,
        ...(retry ? { serverId } : {}),
      });
      if (retry || dto.action === 'REQUEST_CLARIFICATION') {
        await this.notify(
          tx,
          serverId,
          'Delivery task updated',
          `A delivery for ${d.case.ucn} requires your attention.`,
        );
      }
      if (dto.action === 'FORWARD' && d.case.judgeId) {
        await tx.caseEvent.create({
          data: {
            caseId: d.caseId,
            type: 'DELIVERY_REPORT_FORWARDED',
            description: 'A reviewed delivery report was forwarded to the judge.',
          },
        });
        await this.notify(
          tx,
          d.case.judgeId,
          'Delivery report forwarded',
          `See the reviewed report in the Deliveries tab for ${d.case.ucn}.`,
        );
      }
    });
  }

  async document(user: AuthUser, id: string, meta: RequestMeta) {
    const d = await this.own(user, id);
    if (!(await this.storage.exists(d.document.filePath))) throw notFound();
    await this.log(this.prisma, user, id, 'DELIVERY_DOCUMENT_OPENED', meta);
    return new StreamableFile(this.storage.createReadStream(d.document.filePath), {
      type: 'application/pdf',
      disposition: `inline; filename="${sanitizeFileName(d.document.originalName)}"`,
    });
  }

  async acknowledgment(user: AuthUser, id: string, attemptId: string, meta: RequestMeta) {
    const a = await this.prisma.documentDeliveryAttempt.findFirst({
      where: {
        id: attemptId,
        deliveryId: id,
        delivery: this.scope(user),
        ...(user.role === 'JUDGE' ? publishedAttempt : {}),
        ...(user.role === 'PROCESS_SERVER' ? { serverId: user.id } : {}),
      },
    });
    if (!a?.ackKey || !a.ackIv || !a.ackTag || !a.ackType) throw notFound();
    const data = await this.crypto.decryptVerified(a.ackKey, a.ackIv, a.ackTag, {
      user,
      entity: 'DocumentDeliveryAttempt',
      entityId: attemptId,
      meta,
    });
    const extension =
      a.ackType === 'application/pdf' ? 'pdf' : a.ackType === 'image/png' ? 'png' : 'jpg';
    return new StreamableFile(data, {
      type: a.ackType,
      disposition: `inline; filename="acknowledgment.${extension}"`,
    });
  }

  private async acknowledgmentType(file: Express.Multer.File) {
    if (file.size <= 0 || file.size > MAX_PROFILE_PHOTO_BYTES) throw screeningFailed();
    if (await startsWithPdfMagic(file.path)) return 'application/pdf';
    if (await isImage(file, MAX_PROFILE_PHOTO_BYTES, ['png'])) return 'image/png';
    if (await isImage(file, MAX_PROFILE_PHOTO_BYTES, ['jpeg'])) return 'image/jpeg';
    throw screeningFailed();
  }

  private async activeServer(tx: Prisma.TransactionClient, serverId: string) {
    const profile = await tx.processServerProfile.findFirst({
      where: {
        userId: serverId,
        status: 'ACTIVE',
        user: { role: 'PROCESS_SERVER', status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!profile) throw notFound();
  }

  private async update(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    id: string,
    version: number,
    allowed: DeliveryStatus[],
    data: Prisma.DocumentDeliveryUncheckedUpdateManyInput,
  ) {
    const saved = await tx.documentDelivery.updateMany({
      where: { id, version, status: { in: allowed }, ...this.scope(user) },
      data: { ...data, version: { increment: 1 } },
    });
    if (!saved.count) throw changed();
  }

  private log(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    id: string,
    action: string,
    meta: RequestMeta,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.audit.logWithin(tx, {
      actorId: user.id,
      actorRole: user.role,
      action,
      entity: 'DocumentDelivery',
      entityId: id,
      metadata,
      ...meta,
    });
  }

  private notify(tx: Prisma.TransactionClient, userId: string, title: string, body: string) {
    return tx.notification.create({
      data: { userId, channel: 'IN_APP', ...notice('DOCUMENT_DELIVERY', title, body) },
    });
  }
}
