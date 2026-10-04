import { ConflictException, BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './settings.dto';

export const SETTING_KEYS = {
  maxAttachmentMb: 'max_attachment_mb',
  caseRegistrationOpen: 'case_registration_open',
  filingFeeRateModifier: 'filing_fee_rate_modifier',
  courtDayStart: 'court_day_start',
  courtDayEnd: 'court_day_end',
  hearingSlotMinutes: 'hearing_slot_minutes',
} as const;

const DEFAULT_MAX_ATTACHMENT_MB = 25;

export interface SchedulePolicy {
  courtDayStart: string;
  courtDayEnd: string;
  hearingSlotMinutes: number;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Global application constants (UC-2.3). Values live in SystemSetting and FeeStructure. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async raw(key: string): Promise<string | undefined> {
    return (await this.prisma.systemSetting.findUnique({ where: { key } }))?.value;
  }

  async maxAttachmentMb(): Promise<number> {
    const n = Number(await this.raw(SETTING_KEYS.maxAttachmentMb));
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_MAX_ATTACHMENT_MB;
  }

  /** A missing setting means open. */
  async caseRegistrationOpen(): Promise<boolean> {
    const v = await this.raw(SETTING_KEYS.caseRegistrationOpen);
    return v === undefined ? true : v.trim().toLowerCase() !== 'false';
  }

  /** Court hours and slot length (UC-3.x scheduling). */
  async schedulePolicy(): Promise<SchedulePolicy> {
    const start = await this.raw(SETTING_KEYS.courtDayStart);
    const end = await this.raw(SETTING_KEYS.courtDayEnd);
    const mins = Number(await this.raw(SETTING_KEYS.hearingSlotMinutes));
    return {
      courtDayStart: start && /^\d{2}:\d{2}$/.test(start) ? start : '09:00',
      courtDayEnd: end && /^\d{2}:\d{2}$/.test(end) ? end : '14:00',
      hearingSlotMinutes: Number.isInteger(mins) && mins >= 10 && mins <= 240 ? mins : 30,
    };
  }

  async publicSettings() {
    return {
      maxAttachmentMb: await this.maxAttachmentMb(),
      caseRegistrationOpen: await this.caseRegistrationOpen(),
    };
  }

  async getAll() {
    return {
      ...(await this.publicSettings()),
      filingFeeRateModifier: (await this.raw(SETTING_KEYS.filingFeeRateModifier)) ?? '0',
      ...(await this.schedulePolicy()),
      fees: await this.currentFees(),
    };
  }

  /** The newest active fee row for each case type. */
  private async currentFees() {
    const rows = await this.prisma.feeStructure.findMany({
      where: { isActive: true },
      orderBy: [{ caseType: 'asc' }, { effectiveFrom: 'desc' }],
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => !seen.has(r.caseType) && seen.add(r.caseType))
      .map((r) => ({
        id: r.id,
        caseType: r.caseType,
        description: r.description,
        amount: r.amount.toFixed(2),
      }));
  }

  async update(actor: AuthUser, dto: UpdateSettingsDto, meta: { ip?: string; userAgent?: string }) {
    const before = await this.getAll();
    const entries: [string, string, string][] = [];
    if (dto.maxAttachmentMb !== undefined) {
      entries.push([
        SETTING_KEYS.maxAttachmentMb,
        String(dto.maxAttachmentMb),
        'Maximum PDF attachment size in MB',
      ]);
    }
    if (dto.caseRegistrationOpen !== undefined) {
      entries.push([
        SETTING_KEYS.caseRegistrationOpen,
        String(dto.caseRegistrationOpen),
        'Whether new case registration is open',
      ]);
    }
    if (dto.courtDayStart !== undefined) {
      entries.push([SETTING_KEYS.courtDayStart, dto.courtDayStart, 'Court day start (HH:mm)']);
    }
    if (dto.courtDayEnd !== undefined) {
      entries.push([SETTING_KEYS.courtDayEnd, dto.courtDayEnd, 'Court day end (HH:mm)']);
    }
    if (dto.hearingSlotMinutes !== undefined) {
      entries.push([
        SETTING_KEYS.hearingSlotMinutes,
        String(dto.hearingSlotMinutes),
        'Hearing slot length in minutes',
      ]);
    }
    if (dto.filingFeeRateModifier !== undefined) {
      entries.push([
        SETTING_KEYS.filingFeeRateModifier,
        dto.filingFeeRateModifier,
        'Filing fee rate modifier (percent)',
      ]);
    }

    const scheduleChange =
      dto.courtDayStart !== undefined ||
      dto.courtDayEnd !== undefined ||
      dto.hearingSlotMinutes !== undefined;
    if (scheduleChange) {
      const next = {
        courtDayStart: dto.courtDayStart ?? before.courtDayStart,
        courtDayEnd: dto.courtDayEnd ?? before.courtDayEnd,
        hearingSlotMinutes: dto.hearingSlotMinutes ?? before.hearingSlotMinutes,
      };
      const span = toMinutes(next.courtDayEnd) - toMinutes(next.courtDayStart);
      if (span < next.hearingSlotMinutes || span % next.hearingSlotMinutes !== 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: Messages.INVALID_FIELDS,
          details: [
            {
              field: 'courtDayEnd',
              messages: ['Court hours must fit a whole number of hearing slots (end after start).'],
            },
          ],
        });
      }
      const changed = (Object.keys(next) as (keyof SchedulePolicy)[]).some(
        (k) => next[k] !== before[k],
      );
      if (changed) {
        const today = new Date();
        const upcoming = await this.prisma.hearing.count({
          where: {
            status: { not: 'CANCELLED' },
            date: {
              gte: new Date(
                Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
              ),
            },
          },
        });
        if (upcoming > 0) {
          throw new ConflictException({
            code: 'SCHEDULE_POLICY_LOCKED',
            message:
              'Court hours and slot length cannot be changed while upcoming hearings exist. Cancel or complete them first.',
          });
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value, description] of entries) {
        await tx.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value, description },
        });
      }
      for (const fee of dto.fees ?? []) {
        const row = before.fees.find((r) => r.caseType === fee.caseType);
        if (row) {
          await tx.feeStructure.update({ where: { id: row.id }, data: { amount: fee.amount } });
        } else {
          await tx.feeStructure.create({
            data: {
              caseType: fee.caseType,
              description: `Court fee for ${fee.caseType.toLowerCase().replace(/_/g, ' ')} (filing)`,
              amount: fee.amount,
              effectiveFrom: new Date(),
            },
          });
        }
      }
      await this.audit.logWithin(tx, {
        action: AuditAction.SETTINGS_UPDATED,
        actorId: actor.id,
        actorRole: actor.role,
        entity: 'SystemSetting',
        metadata: {
          before: JSON.parse(JSON.stringify(before)),
          requested: JSON.parse(JSON.stringify(dto)),
        },
        ...meta,
      });
    });
    return { message: Messages.SETTINGS_UPDATED, settings: await this.getAll() };
  }
}
