import { Controller, Get, Injectable, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { computeEventHash, userHash } from '../audit/audit-hash';
import { AuditFilterDto, auditRange, buildAuditWhere } from '../audit/audit-query';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { Messages } from '../common/messages';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { pageMeta } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fullName } from './constants';

export const eventId = (id: string) => `EV-${id.slice(0, 8).toUpperCase()}`;

type Row = Prisma.AuditLogGetPayload<object>;

function integrity(r: Row): 'valid' | 'mismatch' | 'legacy' {
  if (!r.eventHash) return 'legacy';
  return computeEventHash({
    id: r.id,
    createdAt: r.createdAt,
    actorId: r.actorId,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    metadata: r.metadata,
  }) === r.eventHash
    ? 'valid'
    : 'mismatch';
}

/** Read-only view of the audit log. There is no write path here, and the database blocks UPDATE and DELETE. */
@Injectable()
export class AdminAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async actorMap(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users = unique.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unique } },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        })
      : [];
    return new Map(users.map((u) => [u.id, u]));
  }

  async list(q: AuditFilterDto) {
    const where = await buildAuditWhere(this.prisma, q);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    const actors = await this.actorMap(rows.map((r) => r.actorId));
    return {
      data: rows.map((r) => {
        const a = r.actorId ? actors.get(r.actorId) : undefined;
        return {
          id: r.id,
          eventId: eventId(r.id),
          userHash: userHash(r.actorId),
          actor: a ? { name: fullName(a), email: a.email } : null,
          actorRole: r.actorRole,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          success: r.success,
          createdAt: r.createdAt,
          legacy: r.eventHash === null,
        };
      }),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  /** Dropdown values for the event type and entity filters. */
  async facets() {
    const [actions, entities] = await Promise.all([
      this.prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
      this.prisma.auditLog.groupBy({ by: ['entity'], orderBy: { entity: 'asc' } }),
    ]);
    return {
      actions: actions.map((a) => a.action),
      entities: entities.map((e) => e.entity).filter((e): e is string => Boolean(e)),
    };
  }

  async detail(id: string) {
    const r = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(Messages.NOT_FOUND);
    const actors = await this.actorMap([r.actorId]);
    const a = r.actorId ? actors.get(r.actorId) : undefined;
    return {
      id: r.id,
      eventId: eventId(r.id),
      userHash: userHash(r.actorId),
      actor: a ? { id: a.id, name: fullName(a), email: a.email } : null,
      actorRole: r.actorRole,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      success: r.success,
      metadata: r.metadata,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
      eventHash: r.eventHash,
      integrity: integrity(r),
    };
  }

  /** Recomputes the hash of every row in the period: counts valid, mismatched and legacy (pre-hash) rows. */
  async verify(
    from: string | undefined,
    to: string | undefined,
    actor: AuthUser,
    meta: { ip?: string; userAgent?: string },
  ) {
    const range = auditRange(from, to);
    const where: Prisma.AuditLogWhereInput = range.gte || range.lt ? { createdAt: range } : {};
    let total = 0;
    let valid = 0;
    let mismatched = 0;
    let legacy = 0;
    const mismatchedIds: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'asc' },
        take: 2000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        total++;
        const state = integrity(r);
        if (state === 'valid') valid++;
        else if (state === 'legacy') legacy++;
        else {
          mismatched++;
          if (mismatchedIds.length < 20) mismatchedIds.push(eventId(r.id));
        }
      }
      cursor = rows[rows.length - 1].id;
    }
    await this.audit.log({
      action: AuditAction.AUDIT_VERIFIED,
      actorId: actor.id,
      actorRole: actor.role,
      entity: 'AuditLog',
      metadata: { from: from ?? null, to: to ?? null, total, valid, mismatched, legacy },
      ...meta,
    });
    return {
      from: from ?? null,
      to: to ?? null,
      total,
      valid,
      mismatched,
      legacy,
      mismatchedIds,
      checkedAt: new Date(),
    };
  }
}

@ApiTags('admin-audit')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  list(@Query() q: AuditFilterDto) {
    return this.audit.list(q);
  }

  @Get('facets')
  facets() {
    return this.audit.facets();
  }

  @Get('verify')
  verify(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request,
  ) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    return this.audit.verify(
      from && iso.test(from) ? from : undefined,
      to && iso.test(to) ? to : undefined,
      user,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Get(':id')
  detail(@Param('id', ParseIdPipe) id: string) {
    return this.audit.detail(id);
  }
}
