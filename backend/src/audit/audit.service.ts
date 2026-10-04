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
  CASE_SUBMITTED: 'CASE_SUBMITTED',
  DOCUMENT_ATTACHED: 'CASE_DOCUMENT_ATTACHED',
  DOCUMENT_DOWNLOADED: 'CASE_DOCUMENT_DOWNLOADED',
  USER_PROVISIONED: 'ADMIN_USER_PROVISIONED',
  USER_STATUS_CHANGED: 'ADMIN_USER_STATUS_CHANGED',
  LAWYER_BAR_CHECK: 'ADMIN_LAWYER_BAR_CHECK',
  LAWYER_VERIFIED: 'ADMIN_LAWYER_VERIFIED',
  LAWYER_REJECTED: 'ADMIN_LAWYER_REJECTED',
  SETTINGS_UPDATED: 'ADMIN_SETTINGS_UPDATED',
  COURTROOM_CREATED: 'ADMIN_COURTROOM_CREATED',
  COURTROOM_UPDATED: 'ADMIN_COURTROOM_UPDATED',
  CASE_ALLOCATED: 'ADMIN_CASE_ALLOCATED',
  HEARING_SCHEDULED: 'HEARING_SCHEDULED',
  HEARING_RESCHEDULED: 'HEARING_RESCHEDULED',
  HEARING_CANCELLED: 'HEARING_CANCELLED',
  SCHEDULE_AUTO_GENERATED: 'SCHEDULE_AUTO_GENERATED',
  CAUSE_LIST_PUBLISHED: 'CAUSE_LIST_PUBLISHED',
  CHALLAN_GENERATED: 'CHALLAN_GENERATED',
  CHALLAN_RECALCULATED: 'CHALLAN_RECALCULATED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  EVIDENCE_UPLOADED: 'EVIDENCE_UPLOADED',
  EVIDENCE_EDITED: 'EVIDENCE_EDITED',
  EVIDENCE_DELETED: 'EVIDENCE_DELETED',
  EVIDENCE_DOWNLOADED: 'EVIDENCE_DOWNLOADED',
  EVIDENCE_LOCKED: 'EVIDENCE_LOCKED',
  NOTIFICATION_PREFERENCES_SAVED: 'NOTIFICATION_PREFERENCES_SAVED',
  FEEDBACK_SUBMITTED: 'FEEDBACK_SUBMITTED',
  FEEDBACK_REVIEWED: 'FEEDBACK_REVIEWED',
  CHAMBER_PROFILE_UPDATED: 'CHAMBER_PROFILE_UPDATED',
  CHAMBER_CLIENT_CREATED: 'CHAMBER_CLIENT_CREATED',
  CHAMBER_CLIENT_UPDATED: 'CHAMBER_CLIENT_UPDATED',
  BILLABLE_RECORDED: 'CHAMBER_BILLABLE_RECORDED',
  RETAINER_DEPOSIT: 'CHAMBER_RETAINER_DEPOSIT',
  LOW_BALANCE_ALERT: 'CHAMBER_LOW_BALANCE_ALERT',
  CHAMBER_EXPENSE: 'CHAMBER_EXPENSE_RECORDED',
  INTERN_CREATED: 'CHAMBER_INTERN_CREATED',
  INTERN_STATUS_CHANGED: 'CHAMBER_INTERN_STATUS_CHANGED',
  RESEARCH_LOG_CREATED: 'RESEARCH_LOG_CREATED',
  RESEARCH_LOG_UPDATED: 'RESEARCH_LOG_UPDATED',
  RESEARCH_LOG_REVIEWED: 'RESEARCH_LOG_REVIEWED',
  ATTENDANCE_CHECKIN: 'ATTENDANCE_CHECKIN',
  ATTENDANCE_CHECKOUT: 'ATTENDANCE_CHECKOUT',
  ATTENDANCE_REJECTED: 'ATTENDANCE_REJECTED',
  COURT_GEOFENCE_UPDATED: 'ADMIN_COURT_GEOFENCE_UPDATED',
  CHAMBER_LOGIN_FAILURE: 'AUTH_CHAMBER_LOGIN_FAILURE',
  SUMMONS_ISSUED: 'SUMMONS_ISSUED',
  SUMMONS_REASSIGNED: 'SUMMONS_REASSIGNED',
  SUMMONS_CANCELLED: 'SUMMONS_CANCELLED',
  SUMMONS_ATTEMPT: 'SUMMONS_ATTEMPT',
  SUMMONS_EXECUTED: 'SUMMONS_EXECUTED',
  SUMMONS_SEAL_VERIFIED: 'SUMMONS_SEAL_VERIFIED',
  SUMMONS_PROOF_VIEWED: 'SUMMONS_PROOF_VIEWED',
  SERVER_PROFILE_UPDATED: 'SERVER_PROFILE_UPDATED',
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
      await this.prisma.auditLog.create({ data: toData(entry) });
    } catch (error) {
      // An audit failure must never take the request down, but it must be visible.
      this.logger.error(`Failed to write audit log (${entry.action})`, error as Error);
    }
  }

  /**
   * Writes an audit entry inside an existing transaction. Errors are NOT swallowed: if the audit row
   * cannot be written, the whole transaction (for example a case submission) is rolled back.
   */
  async logWithin(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: toData(entry) });
  }
}

function toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    action: entry.action,
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole ?? null,
    entity: entry.entity,
    entityId: entry.entityId,
    success: entry.success ?? true,
    metadata: entry.metadata,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent?.slice(0, 255),
  };
}
