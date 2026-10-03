import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const AuditAction = {
  REGISTER: 'AUTH_REGISTER',
  LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  LOGIN_FAILURE: 'AUTH_LOGIN_FAILURE',
  LOGOUT: 'AUTH_LOGOUT',
  PASSWORD_RESET_REQUESTED: 'AUTH_PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'AUTH_PASSWORD_RESET_COMPLETED',
  PROFILE_UPDATED: 'USER_PROFILE_UPDATED',
} as const;

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  actorRole?: Role | null;
  entity?: string;
  entityId?: string;
  success?: boolean;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

/** Append-only writer for the audit log. There is intentionally no update or delete method. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorId: entry.actorId ?? null,
          actorRole: entry.actorRole ?? null,
          entity: entry.entity,
          entityId: entry.entityId,
          success: entry.success ?? true,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent?.slice(0, 255),
        },
      });
    } catch (error) {
      // An audit failure must never take the request down, but it must be visible.
      this.logger.error(`Failed to write audit log (${entry.action})`, error as Error);
    }
  }
}
