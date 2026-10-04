import { Injectable, NotFoundException } from '@nestjs/common';
import { Messages } from '../common/messages';
import { PageQueryDto, pageMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** In-app only (no email or SMS yet). */
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
