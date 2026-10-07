import { ConflictException, BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { Messages } from '../common/messages';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './settings.dto';
import { pkToday } from '../common/pk-time';

export const SETTING_KEYS = {
  maxAttachmentMb: 'max_attachment_mb',
  caseRegistrationOpen: 'case_registration_open',
  filingFeeRateModifier: 'filing_fee_rate_modifier',
  courtDayStart: 'court_day_start',
  courtDayEnd: 'court_day_end',
  hearingSlotMinutes: 'hearing_slot_minutes',
  adValoremPercent: 'ad_valorem_percent',
  adValoremCapPkr: 'ad_valorem_cap_pkr',
  challanDueDays: 'challan_due_days',
  maxEvidenceMb: 'max_evidence_mb',
  attendanceDefaultRadiusM: 'attendance_default_radius_m',
  attendanceMaxAccuracyM: 'attendance_max_accuracy_m',
  summonsMaxGpsAccuracyM: 'summons_max_gps_accuracy_m',
  summonsDefaultDueDays: 'summons_default_due_days',
  securityEscalationThreshold: 'security_escalation_threshold',
} as const;

const DEFAULT_MAX_ATTACHMENT_MB = 25;
const DEFAULT_MAX_EVIDENCE_MB = 100;

export interface FeePolicy {
  adValoremPercent: string;
  adValoremCapPkr: string;
  challanDueDays: number;
  filingFeeRateModifier: string;
}

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

  async maxEvidenceMb(): Promise<number> {
    const n = Number(await this.raw(SETTING_KEYS.maxEvidenceMb));
    return Number.isInteger(n) && n >= 1 && n <= 200 ? n : DEFAULT_MAX_EVIDENCE_MB;
  }

  /** Geo-fence radius used by courts without their own radius, and the worst GPS accuracy accepted. */
  async attendancePolicy() {
    const radius = Number(await this.raw(SETTING_KEYS.attendanceDefaultRadiusM));
    const acc = Number(await this.raw(SETTING_KEYS.attendanceMaxAccuracyM));
    return {
      defaultRadiusM: Number.isInteger(radius) && radius >= 50 && radius <= 5000 ? radius : 300,
      maxAccuracyM: Number.isInteger(acc) && acc >= 10 && acc <= 1000 ? acc : 150,
    };
  }

  /** Worst GPS accuracy a process server may commit with, and the default due period of a summons. */
  async summonsPolicy() {
    const acc = Number(await this.raw(SETTING_KEYS.summonsMaxGpsAccuracyM));
    const days = Number(await this.raw(SETTING_KEYS.summonsDefaultDueDays));
    return {
      maxGpsAccuracyM: Number.isInteger(acc) && acc >= 10 && acc <= 500 ? acc : 100,
      defaultDueDays: Number.isInteger(days) && days >= 1 && days <= 90 ? days : 7,
    };
  }

  /** Refused /admin attempts (within 10 minutes) that raise a privilege escalation alert. */
  async securityEscalationThreshold(): Promise<number> {
    const n = Number(await this.raw(SETTING_KEYS.securityEscalationThreshold));
    return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 3;
  }

  async feePolicy(): Promise<FeePolicy> {
    const pct = Number(await this.raw(SETTING_KEYS.adValoremPercent));
    const cap = Number(await this.raw(SETTING_KEYS.adValoremCapPkr));
    const days = Number(await this.raw(SETTING_KEYS.challanDueDays));
    return {
      adValoremPercent: Number.isFinite(pct) && pct >= 0 && pct <= 10 ? String(pct) : '1',
      adValoremCapPkr: Number.isFinite(cap) && cap >= 0 ? String(cap) : '50000',
      challanDueDays: Number.isInteger(days) && days >= 1 && days <= 90 ? days : 7,
      filingFeeRateModifier: (await this.raw(SETTING_KEYS.filingFeeRateModifier)) ?? '0',
    };
  }

  /** Base filing fee in force for a case type (newest active FeeStructure row). */
  async baseFee(caseType: string): Promise<string> {
    const row = await this.prisma.feeStructure.findFirst({
      where: { caseType: caseType as never, isActive: true, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row ? row.amount.toFixed(2) : '0.00';
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
      adValoremPercent: (await this.feePolicy()).adValoremPercent,
      adValoremCapPkr: (await this.feePolicy()).adValoremCapPkr,
      challanDueDays: (await this.feePolicy()).challanDueDays,
      maxEvidenceMb: await this.maxEvidenceMb(),
      attendanceDefaultRadiusM: (await this.attendancePolicy()).defaultRadiusM,
      attendanceMaxAccuracyM: (await this.attendancePolicy()).maxAccuracyM,
      summonsMaxGpsAccuracyM: (await this.summonsPolicy()).maxGpsAccuracyM,
      summonsDefaultDueDays: (await this.summonsPolicy()).defaultDueDays,
      securityEscalationThreshold: await this.securityEscalationThreshold(),
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
    if (dto.adValoremPercent !== undefined) {
      entries.push([
        SETTING_KEYS.adValoremPercent,
        dto.adValoremPercent,
        'Ad valorem percentage for Civil Suits',
      ]);
    }
    if (dto.adValoremCapPkr !== undefined) {
      entries.push([
        SETTING_KEYS.adValoremCapPkr,
        dto.adValoremCapPkr,
        'Cap on the ad valorem fee (PKR)',
      ]);
    }
    if (dto.challanDueDays !== undefined) {
      entries.push([
        SETTING_KEYS.challanDueDays,
        String(dto.challanDueDays),
        'Days until a challan is due',
      ]);
    }
    if (dto.maxEvidenceMb !== undefined) {
      entries.push([
        SETTING_KEYS.maxEvidenceMb,
        String(dto.maxEvidenceMb),
        'Maximum evidence file size in MB',
      ]);
    }
    if (dto.attendanceDefaultRadiusM !== undefined) {
      entries.push([
        SETTING_KEYS.attendanceDefaultRadiusM,
        String(dto.attendanceDefaultRadiusM),
        'Default court geo-fence radius in metres',
      ]);
    }
    if (dto.attendanceMaxAccuracyM !== undefined) {
      entries.push([
        SETTING_KEYS.attendanceMaxAccuracyM,
        String(dto.attendanceMaxAccuracyM),
        'Worst location accuracy accepted for attendance, in metres',
      ]);
    }
    if (dto.summonsMaxGpsAccuracyM !== undefined) {
      entries.push([
        SETTING_KEYS.summonsMaxGpsAccuracyM,
        String(dto.summonsMaxGpsAccuracyM),
        'Worst GPS accuracy accepted for summons progress and proof, in metres',
      ]);
    }
    if (dto.summonsDefaultDueDays !== undefined) {
      entries.push([
        SETTING_KEYS.summonsDefaultDueDays,
        String(dto.summonsDefaultDueDays),
        'Default number of days until a summons is due',
      ]);
    }
    if (dto.securityEscalationThreshold !== undefined) {
      entries.push([
        SETTING_KEYS.securityEscalationThreshold,
        String(dto.securityEscalationThreshold),
        'Refused admin-route attempts within 10 minutes that raise a security alert',
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
        const upcoming = await this.prisma.hearing.count({
          where: { status: { not: 'CANCELLED' }, date: { gte: pkToday() } },
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
