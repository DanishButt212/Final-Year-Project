import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { caseAudience } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { Trim } from '../common/validators';
import { CaseEventType, DecisionType } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ddmmyyyy, todayUtc } from '../scheduling/slots';

export const OUTCOME_MESSAGE = 'Hearing outcome recorded.';
export const DECIDED_MESSAGE = 'Case decided and the order has been recorded.';
export const NO_HEARING_MESSAGE =
  'A case can be decided only after at least one hearing has taken place.';
const ALREADY_DECIDED = 'This case has already been decided.';

export class HearingOutcomeDto {
  @IsIn(['COMPLETED', 'ADJOURNED'], { message: 'Choose Completed or Adjourned.' })
  status!: 'COMPLETED' | 'ADJOURNED';

  @Trim()
  @IsString()
  @MinLength(10, { message: 'Order notes must be between 10 and 2000 characters.' })
  @MaxLength(2000, { message: 'Order notes must be between 10 and 2000 characters.' })
  orderNotes!: string;
}

export class DecideCaseDto {
  @IsIn(['JUDGMENT', 'DISMISSED', 'DISPOSED'], {
    message: 'Choose Judgment, Dismissed or Disposed.',
  })
  decisionType!: DecisionType;

  @Trim()
  @IsString()
  @MinLength(20, { message: 'The order must be between 20 and 5000 characters.' })
  @MaxLength(5000, { message: 'The order must be between 20 and 5000 characters.' })
  orderText!: string;
}

const LABEL: Record<DecisionType, string> = {
  JUDGMENT: 'Judgment',
  DISMISSED: 'Dismissed',
  DISPOSED: 'Disposed',
};

const conflict = (code: string, message: string) => new ConflictException({ code, message });

/** Judge decisions: hearing outcomes and deciding a case. Both work only on the judge's own cases. */
@Injectable()
export class JudgeDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly scheduling: SchedulingService,
  ) {}

  async recordOutcome(
    judge: AuthUser,
    hearingId: string,
    dto: HearingOutcomeDto,
    meta: RequestMeta,
  ) {
    const h = await this.prisma.hearing.findFirst({
      where: { id: hearingId, case: { judgeId: judge.id } },
      select: {
        id: true,
        caseId: true,
        date: true,
        status: true,
        startTime: true,
        case: { select: { ucn: true, status: true } },
      },
    });
    if (!h) throw new NotFoundException(Messages.NOT_FOUND);
    if (h.case.status === 'DECIDED') throw conflict('CASE_DECIDED', ALREADY_DECIDED);
    if (h.status !== 'SCHEDULED') {
      throw conflict(
        'OUTCOME_NOT_ALLOWED',
        h.status === 'CANCELLED'
          ? 'A cancelled hearing has no outcome.'
          : 'An outcome has already been recorded for this hearing.',
      );
    }
    const today = todayUtc();
    if (h.date.getTime() > today.getTime()) {
      throw conflict(
        'HEARING_IN_FUTURE',
        'An outcome can be recorded only for a hearing dated today or earlier.',
      );
    }
    const adjourned = dto.status === 'ADJOURNED';
    const when = `${ddmmyyyy(h.date)}${h.startTime ? ` at ${h.startTime}` : ''}`;

    await this.prisma.$transaction(async (tx) => {
      const done = await tx.hearing.updateMany({
        where: { id: h.id, status: 'SCHEDULED' },
        data: {
          status: adjourned ? 'ADJOURNED' : 'HELD',
          orderSummary: dto.orderNotes,
          outcomeAt: new Date(),
        },
      });
      if (done.count !== 1) {
        throw conflict(
          'OUTCOME_NOT_ALLOWED',
          'An outcome has already been recorded for this hearing.',
        );
      }
      // Nothing else is scheduled ahead: the case now waits for the registry to fix the next date.
      const ahead = await tx.hearing.count({
        where: {
          caseId: h.caseId,
          id: { not: h.id },
          status: 'SCHEDULED',
          date: { gte: today },
        },
      });
      if (ahead === 0) {
        await tx.case.updateMany({
          where: { id: h.caseId, status: 'HEARING_FIXED' },
          data: { status: 'PENDING' },
        });
      }
      await tx.caseEvent.create({
        data: {
          caseId: h.caseId,
          type: adjourned ? CaseEventType.HEARING_ADJOURNED : CaseEventType.HEARING_COMPLETED,
          description: `Hearing of ${when} ${adjourned ? 'adjourned' : 'completed'}. Order notes: ${dto.orderNotes}`,
          actorId: judge.id,
        },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.HEARING_OUTCOME_RECORDED,
        actorId: judge.id,
        actorRole: judge.role,
        entity: 'Hearing',
        entityId: h.id,
        metadata: { ucn: h.case.ucn, date: h.date.toISOString().slice(0, 10), outcome: dto.status },
        ...meta,
      });
      if (adjourned) {
        const admins = await tx.user.findMany({
          where: { role: 'ADMIN', status: 'ACTIVE' },
          select: { id: true },
        });
        const parties = await caseAudience(tx, h.caseId);
        await this.notifications.notifyMany(
          [...parties, ...admins.map((a) => a.id)],
          {
            type: 'HEARING_ADJOURNED',
            title: 'Hearing adjourned',
            body: `${h.case.ucn}: the hearing of ${when} was adjourned. A new date needs to be fixed.`,
          },
          tx,
        );
      }
    });
    return { message: OUTCOME_MESSAGE };
  }

  async decide(judge: AuthUser, caseId: string, dto: DecideCaseDto, meta: RequestMeta) {
    const c = await this.prisma.case.findFirst({
      where: { id: caseId, judgeId: judge.id },
      select: { id: true, ucn: true, status: true },
    });
    if (!c) throw new NotFoundException(Messages.NOT_FOUND);
    if (c.status === 'DECIDED') throw conflict('CASE_DECIDED', ALREADY_DECIDED);
    if (!['ALLOCATED', 'PENDING', 'HEARING_FIXED'].includes(c.status)) {
      throw conflict('NOT_DECIDABLE', 'Only an allocated case can be decided.');
    }
    const today = todayUtc();
    const held = await this.prisma.hearing.count({
      where: { caseId, status: { not: 'CANCELLED' }, date: { lte: today } },
    });
    if (held === 0) throw conflict('NO_HEARING_HELD', NO_HEARING_MESSAGE);

    const now = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        // Conditional on "still open": two decisions can never both win.
        const done = await tx.case.updateMany({
          where: {
            id: caseId,
            judgeId: judge.id,
            decidedAt: null,
            status: { in: ['ALLOCATED', 'PENDING', 'HEARING_FIXED'] },
          },
          data: {
            status: 'DECIDED',
            decidedAt: now,
            decisionType: dto.decisionType,
            decisionText: dto.orderText,
          },
        });
        if (done.count !== 1) throw conflict('CASE_DECIDED', ALREADY_DECIDED);

        // Hearings still open: those ahead are cancelled (slots released), those dated today or
        // earlier that never got an outcome are closed as held.
        const open = await tx.hearing.findMany({
          where: { caseId, status: { in: ['SCHEDULED', 'ADJOURNED'] } },
          select: {
            id: true,
            date: true,
            status: true,
            startTime: true,
            courtroom: { select: { courtId: true } },
          },
        });
        const cancelled = open.filter((x) => x.date.getTime() > today.getTime());
        const closed = open.filter(
          (x) => x.date.getTime() <= today.getTime() && x.status === 'SCHEDULED',
        );
        if (cancelled.length > 0) {
          await tx.hearing.updateMany({
            where: { id: { in: cancelled.map((x) => x.id) } },
            data: { status: 'CANCELLED' },
          });
          const seen = new Set<string>();
          for (const x of cancelled) {
            const key = `${x.courtroom?.courtId ?? ''}|${x.date.toISOString()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            await this.scheduling.syncCauseList(tx, x.courtroom?.courtId, x.date);
          }
          await tx.caseEvent.create({
            data: {
              caseId,
              type: CaseEventType.HEARING_CANCELLED,
              description: `${cancelled.length} future hearing${cancelled.length === 1 ? '' : 's'} cancelled because the case was decided.`,
              actorId: judge.id,
            },
          });
        }
        if (closed.length > 0) {
          await tx.hearing.updateMany({
            where: { id: { in: closed.map((x) => x.id) } },
            data: { status: 'HELD', outcomeAt: now },
          });
        }

        const locked = await tx.evidence.updateMany({
          where: { caseId, deletedAt: null, lockedAt: null },
          data: { lockedAt: now, lockedById: judge.id, lockReason: 'Case decided' },
        });
        if (locked.count > 0) {
          await tx.caseEvent.create({
            data: {
              caseId,
              type: CaseEventType.EVIDENCE_LOCKED,
              description: `${locked.count} exhibit${locked.count === 1 ? '' : 's'} locked because the case was decided.`,
              actorId: judge.id,
            },
          });
        }

        // Summons not yet served or cancelled are cancelled with the case; executed ones stay untouched.
        const openSummons = await tx.summons.findMany({
          where: {
            caseId,
            status: { in: ['PENDING_ASSIGNMENT', 'ASSIGNED', 'ATTEMPT_IN_PROGRESS'] },
          },
          select: { id: true, recipientName: true, serverId: true },
        });
        for (const s of openSummons) {
          const done = await tx.summons.updateMany({
            where: {
              id: s.id,
              status: { in: ['PENDING_ASSIGNMENT', 'ASSIGNED', 'ATTEMPT_IN_PROGRESS'] },
            },
            data: { status: 'CANCELLED', cancelReason: 'Case decided', cancelledAt: now },
          });
          if (done.count !== 1) continue;
          // Like every summons event, this one carries no actor.
          await tx.caseEvent.create({
            data: {
              caseId,
              type: CaseEventType.SUMMONS_CANCELLED,
              description: `Summons for ${s.recipientName} cancelled because the case was decided.`,
            },
          });
          await this.audit.logWithin(tx, {
            action: AuditAction.SUMMONS_CANCELLED,
            actorId: judge.id,
            actorRole: judge.role,
            entity: 'Summons',
            entityId: s.id,
            metadata: { reason: 'Case decided', ucn: c.ucn },
            ...meta,
          });
          if (s.serverId) {
            await this.notifications.notify(
              s.serverId,
              {
                type: 'SUMMONS_ASSIGNED',
                title: 'Summons cancelled',
                body: `${s.recipientName} (${c.ucn}) was cancelled because the case was decided.`,
              },
              tx,
            );
          }
        }

        await tx.caseEvent.create({
          data: {
            caseId,
            type: CaseEventType.CASE_DECIDED,
            description: `Case decided: ${LABEL[dto.decisionType]}.`,
            actorId: judge.id,
          },
        });
        await this.audit.logWithin(tx, {
          action: AuditAction.CASE_DECIDED,
          actorId: judge.id,
          actorRole: judge.role,
          entity: 'Case',
          entityId: caseId,
          metadata: {
            ucn: c.ucn,
            decisionType: dto.decisionType,
            cancelledHearings: cancelled.length,
            lockedExhibits: locked.count,
            cancelledSummons: openSummons.length,
          },
          ...meta,
        });
        const audience = await caseAudience(tx, caseId);
        await this.notifications.notifyMany(
          audience,
          {
            type: 'CASE_DECIDED',
            title: 'Your case has been decided',
            body: `${c.ucn}: ${LABEL[dto.decisionType]}. Open the case to read the order.`,
          },
          tx,
        );
        if (cancelled.length > 0) {
          await this.notifications.notifyMany(
            audience,
            {
              type: 'HEARING_CANCELLED',
              title: 'Hearings cancelled',
              body: `${c.ucn}: ${cancelled.length} future hearing${cancelled.length === 1 ? ' was' : 's were'} cancelled because the case was decided.`,
            },
            tx,
          );
        }
      },
      { timeout: 20_000 },
    );
    return { message: DECIDED_MESSAGE };
  }
}
