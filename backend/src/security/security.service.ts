import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { fullName, RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { Prisma, Role, SecurityAlertStatus } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { isLoopback, normalizeIp } from './ip';

export const HOST_BLOCKED_MESSAGE = 'Privilege escalation neutralized. Host blocked.';
export const OWN_HOST_MESSAGE = 'You cannot block your own host.';
export const NOT_ENFORCED_NOTE = 'Recorded, not enforced on local development hosts.';
export const WINDOW_MS = 10 * 60 * 1000;
const CACHE_MS = 15_000;

export interface EscalationInput {
  actor?: { id: string; role: Role } | null;
  ip?: string | null;
  method: string;
  route: string;
  code: string;
}

type UserLite = { id: string; firstName: string; lastName: string; email: string };

const handled = () =>
  new ConflictException({ code: 'ALERT_HANDLED', message: 'This alert has already been handled.' });

/** Privilege escalation monitoring: raw events, alerts, session termination and host blocking. */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private blocked = new Set<string>();
  private loadedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ blocked hosts (hot path)

  async isBlocked(ip: string | null | undefined): Promise<boolean> {
    const v = normalizeIp(ip);
    if (!v || isLoopback(v)) return false;
    if (Date.now() - this.loadedAt > CACHE_MS) {
      const rows = await this.prisma.blockedHost.findMany({ select: { ip: true } });
      this.blocked = new Set(rows.map((r) => r.ip));
      this.loadedAt = Date.now();
    }
    return this.blocked.has(v);
  }

  private invalidate() {
    this.loadedAt = 0;
  }

  // ------------------------------------------------------------------ detection

  /** Called by the guards. Never throws: a failure here must not change the response of the refused request. */
  async recordEscalation(input: EscalationInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      this.logger.error('Failed to record a security event', error as Error);
    }
  }

  private async record(input: EscalationInput) {
    const ip = normalizeIp(input.ip);
    const actorId = input.actor?.id ?? null;
    const role = input.actor?.role ?? null;
    const route = input.route.split('?')[0].slice(0, 200);
    const now = new Date();
    await this.prisma.securityEvent.create({
      data: {
        type: 'PRIVILEGE_ESCALATION',
        actorId,
        role,
        ip,
        method: input.method.slice(0, 10),
        route,
        code: input.code,
        createdAt: now,
      },
    });
    // Admin accounts are never auto-terminated or alerted on.
    if (role === 'ADMIN') return;

    const threshold = await this.settings.securityEscalationThreshold();
    const subject = actorId ? `a:${actorId}` : ip ? `i:${ip}` : null;
    if (!subject) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${subject}))) AS l`;
      const last = await tx.securityAlert.findFirst({
        where: actorId ? { actorId } : { actorId: null, ip },
        orderBy: { createdAt: 'desc' },
      });
      const from = new Date(Math.max(now.getTime() - WINDOW_MS, last?.createdAt.getTime() ?? 0));
      const [byActor, byIp] = await Promise.all([
        actorId
          ? tx.securityEvent.count({ where: { actorId, createdAt: { gt: from } } })
          : Promise.resolve(0),
        ip
          ? tx.securityEvent.count({ where: { ip, createdAt: { gt: from } } })
          : Promise.resolve(0),
      ]);
      const count = Math.max(byActor, byIp);
      if (count < threshold) return;

      const open = await tx.securityAlert.findFirst({
        where: { status: 'OPEN', ...(actorId ? { actorId } : { actorId: null, ip }) },
      });
      if (open) {
        await tx.securityAlert.update({
          where: { id: open.id },
          data: { attemptCount: count, lastActionCode: input.code, lastRoute: route },
        });
        return;
      }
      const user = actorId
        ? await tx.user.findUnique({ where: { id: actorId }, select: { email: true } })
        : null;
      const alert = await tx.securityAlert.create({
        data: {
          actorId,
          actorEmail: user?.email ?? null,
          actorRole: role,
          ip,
          attemptCount: count,
          lastActionCode: input.code,
          lastRoute: route,
        },
      });
      if (actorId) {
        await tx.user.update({ where: { id: actorId }, data: { sessionsInvalidatedAt: now } });
        await this.audit.logWithin(tx, {
          action: AuditAction.SECURITY_SESSION_TERMINATED,
          actorId,
          actorRole: role,
          entity: 'User',
          entityId: actorId,
          metadata: { alertId: alert.id, ip },
          ipAddress: ip ?? undefined,
        });
      }
      await this.audit.logWithin(tx, {
        action: AuditAction.SECURITY_ESCALATION_ALERT,
        actorId,
        actorRole: role,
        entity: 'SecurityAlert',
        entityId: alert.id,
        metadata: { ip, attempts: count, code: input.code, route },
        ipAddress: ip ?? undefined,
      });
      const admins = await tx.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
      await this.notifications.notifyMany(
        admins.map((a) => a.id),
        {
          type: 'SECURITY_ALERT',
          title: 'Privilege escalation alert',
          body: `${user?.email ?? 'An unidentified client'} from ${ip ?? 'an unknown address'} was refused ${count} times on admin routes (${input.code}). Review it under Security Alerts.`,
        },
        tx,
      );
    });
  }

  // ------------------------------------------------------------------ admin API

  private async actors(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users: UserLite[] = unique.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unique } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    return new Map(users.map((u) => [u.id, u]));
  }

  private alertView(
    a: Prisma.SecurityAlertGetPayload<object>,
    users: Map<string, UserLite>,
    blockedIps: Set<string>,
  ) {
    const u = a.actorId ? users.get(a.actorId) : undefined;
    const account = u
      ? { id: u.id, name: fullName(u), email: u.email }
      : a.actorEmail
        ? { id: a.actorId, name: null, email: a.actorEmail }
        : null;
    return {
      id: a.id,
      status: a.status,
      ip: a.ip,
      account,
      role: a.actorRole,
      attemptCount: a.attemptCount,
      lastActionCode: a.lastActionCode,
      lastRoute: a.lastRoute,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt,
      loopback: isLoopback(a.ip),
      hostBlocked: a.ip ? blockedIps.has(a.ip) : false,
    };
  }

  async alerts(status?: SecurityAlertStatus) {
    const [rows, open, blocked] = await Promise.all([
      this.prisma.securityAlert.findMany({
        where: status ? { status } : {},
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 200,
      }),
      this.prisma.securityAlert.count({ where: { status: 'OPEN' } }),
      this.prisma.blockedHost.findMany({ select: { ip: true } }),
    ]);
    const users = await this.actors(rows.map((r) => r.actorId));
    const ips = new Set(blocked.map((b) => b.ip));
    return { openCount: open, data: rows.map((r) => this.alertView(r, users, ips)) };
  }

  async summary() {
    return { openCount: await this.prisma.securityAlert.count({ where: { status: 'OPEN' } }) };
  }

  async alertDetail(id: string) {
    const a = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(Messages.NOT_FOUND);
    const [events, blocked] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where: a.actorId ? { actorId: a.actorId } : { actorId: null, ip: a.ip },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.blockedHost.findMany({ select: { ip: true } }),
    ]);
    const users = await this.actors([a.actorId, a.resolvedById]);
    const resolver = a.resolvedById ? users.get(a.resolvedById) : undefined;
    return {
      ...this.alertView(a, users, new Set(blocked.map((b) => b.ip))),
      resolvedBy: resolver ? fullName(resolver) : null,
      events: events.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        method: e.method,
        route: e.route,
        code: e.code,
        ip: e.ip,
      })),
    };
  }

  async blacklist(
    admin: AuthUser,
    id: string,
    reason: string | undefined,
    requesterIp: string | undefined,
    meta: RequestMeta,
  ) {
    const a = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(Messages.NOT_FOUND);
    if (a.status !== 'OPEN') throw handled();
    if (!a.ip) {
      throw new ConflictException({
        code: 'NO_HOST',
        message: 'This alert has no host address to block.',
      });
    }
    const ip = a.ip;
    const loopback = isLoopback(ip);
    if (!loopback && normalizeIp(requesterIp) === ip) {
      throw new ConflictException({ code: 'OWN_HOST', message: OWN_HOST_MESSAGE });
    }
    const text = (reason?.trim() || `Privilege escalation: ${a.lastActionCode}`).slice(0, 200);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.securityAlert.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: 'BLOCKED', resolvedById: admin.id, resolvedAt: new Date() },
      });
      if (done.count !== 1) throw handled();
      await tx.blockedHost.upsert({
        where: { ip },
        update: { reason: text, alertId: id },
        create: { ip, reason: text, createdById: admin.id, alertId: id },
      });
      await this.audit.logWithin(tx, {
        action: AuditAction.HOST_BLOCKED,
        actorId: admin.id,
        actorRole: admin.role,
        entity: 'SecurityAlert',
        entityId: id,
        metadata: { ip, enforced: !loopback, reason: text },
        ...meta,
      });
    });
    this.invalidate();
    return {
      message: HOST_BLOCKED_MESSAGE,
      enforced: !loopback,
      ...(loopback ? { note: NOT_ENFORCED_NOTE } : {}),
    };
  }

  async dismiss(admin: AuthUser, id: string, meta: RequestMeta) {
    const a = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(Messages.NOT_FOUND);
    const res = await this.prisma.securityAlert.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'DISMISSED', resolvedById: admin.id, resolvedAt: new Date() },
    });
    if (res.count !== 1) throw handled();
    await this.audit.log({
      action: AuditAction.SECURITY_ALERT_DISMISSED,
      actorId: admin.id,
      actorRole: admin.role,
      entity: 'SecurityAlert',
      entityId: id,
      metadata: { ip: a.ip },
      ...meta,
    });
    return { message: 'Alert dismissed.' };
  }

  async blockedHosts() {
    const rows = await this.prisma.blockedHost.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return {
      data: rows.map((b) => ({
        id: b.id,
        ip: b.ip,
        reason: b.reason,
        createdAt: b.createdAt,
        createdBy: fullName(b.createdBy),
        alertId: b.alertId,
        enforced: !isLoopback(b.ip),
        note: isLoopback(b.ip) ? NOT_ENFORCED_NOTE : null,
      })),
    };
  }

  async unblock(admin: AuthUser, id: string, meta: RequestMeta) {
    const b = await this.prisma.blockedHost.findUnique({ where: { id } });
    if (!b) throw new NotFoundException(Messages.NOT_FOUND);
    await this.prisma.blockedHost.delete({ where: { id } });
    this.invalidate();
    await this.audit.log({
      action: AuditAction.HOST_UNBLOCKED,
      actorId: admin.id,
      actorRole: admin.role,
      entity: 'BlockedHost',
      entityId: id,
      metadata: { ip: b.ip },
      ...meta,
    });
    return { message: 'Host unblocked.' };
  }

  async events(limit = 50) {
    const rows = await this.prisma.securityEvent.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 200),
    });
    const users = await this.actors(rows.map((r) => r.actorId));
    return {
      data: rows.map((e) => ({
        id: e.id,
        type: e.type,
        createdAt: e.createdAt,
        ip: e.ip,
        account: e.actorId ? (users.get(e.actorId)?.email ?? e.actorId) : null,
        role: e.role,
        method: e.method,
        route: e.route,
        code: e.code,
      })),
    };
  }
}
