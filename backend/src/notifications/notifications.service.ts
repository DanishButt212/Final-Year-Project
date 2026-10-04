import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MockMailerService } from '../integrations/mock-mailer.service';
import { Prisma } from '../generated/prisma/client';
import { Messages } from '../common/messages';
import { PageQueryDto, pageMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyPayload {
  type: string;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('MockDelivery');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MockMailerService,
  ) {}

  /**
   * Central entry point: stores the in-app notification (always on) and, for every channel the user enabled in
   * "Notification Options Preferences", performs a MOCK delivery by logging it. Pass a transaction client as `db`
   * to store the notification inside the caller's transaction. Never put secrets in a payload.
   */
  async notify(userId: string, payload: NotifyPayload, db: Prisma.TransactionClient = this.prisma) {
    await this.notifyMany([userId], payload, db);
  }

  async notifyMany(
    userIds: string[],
    payload: NotifyPayload | ((userId: string) => NotifyPayload),
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const now = new Date();
    const resolve = (id: string) => (typeof payload === 'function' ? payload(id) : payload);
    await db.notification.createMany({
      data: ids.map((userId) => ({ userId, ...resolve(userId), channel: 'IN_APP' as const, sentAt: now })),
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, phone: true, notificationPreference: true },
    });
    for (const u of users) {
      const pref = u.notificationPreference;
      const { title, body } = resolve(u.id);
      const summary = `${title}: ${body}`.slice(0, 140);
      if (pref ? pref.emailEnabled : true) this.mailer.send(u.email, title, body);
      if (pref?.smsEnabled) this.logger.log(`[MOCK SMS] to=${u.phone} ${summary}`);
      if (pref?.pushEnabled) this.logger.log(`[MOCK PUSH] user=${u.id} ${summary}`);
    }
  }

  /** In-app notification only (kept for callers that must not trigger external channels). */
  create(userId: string, type: string, title: string, body: string) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, channel: 'IN_APP', sentAt: new Date() },
    });
  }

  async list(userId: string, query: PageQueryDto) {
    const where = { userId, channel: 'IN_APP' as const };
    const [total, unreadCount, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: { id: true, type: true, title: true, body: true, readAt: true, createdAt: true },
      }),
    ]);
    return { data: rows, unreadCount, meta: pageMeta(query.page, query.limit, total) };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.count({ where: { id, userId } });
      if (!exists) throw new NotFoundException(Messages.NOT_FOUND);
    }
    return { success: true };
  }

  async readAll(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
