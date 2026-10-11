import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../audit/audit.service';
import { caseAudience } from '../common/case-access';
import { AuthUser } from '../common/decorators';
import { PK_TZ, pkToday } from '../common/pk-time';
import { NotificationsService, notice } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { addDays, buildSlots, isoDate } from '../scheduling/slots';

export const REMINDERS_SENT_MESSAGE = 'Hearing reminders sent.';
export const REMINDER_AUDIT_ACTION = 'HEARING_REMINDERS_SENT';

export interface ReminderRun {
  date: string;
  hearings: number;
  sent: number;
  alreadySent: number;
}

/**
 * Daily hearing reminders (UX upgrade C4). Every day at 08:00 Pakistan time, everyone on a hearing scheduled for
 * the next day (the filer, every lawyer on the case and the judge) gets one in-app notification; e-mail, SMS and
 * push follow their notification preferences through NotificationsService. A HearingReminder row per hearing,
 * person and hearing date makes the job idempotent: running it twice, or by hand after the scheduled run, sends
 * nothing new. Each run is audit-logged as a system action (or as the administrator who started it).
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Cron('0 8 * * *', { name: 'hearing-reminders', timeZone: PK_TZ })
  async scheduled(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return; // tests call run() directly
    try {
      const r = await this.run(null, 'schedule');
      this.logger.log(
        `Hearing reminders for ${r.date}: ${r.sent} sent, ${r.alreadySent} already sent.`,
      );
    } catch (error) {
      this.logger.error('Hearing reminder job failed', error as Error);
    }
  }

  /** Sends tomorrow's reminders. `actor` is the administrator for a manual run, null for the scheduled job. */
  async run(
    actor: AuthUser | null,
    trigger: 'schedule' | 'manual',
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<ReminderRun> {
    const tomorrow = addDays(pkToday(), 1);
    const slots = buildSlots(await this.settings.schedulePolicy());
    const hearings = await this.prisma.hearing.findMany({
      where: { date: tomorrow, status: 'SCHEDULED' },
      select: {
        id: true,
        caseId: true,
        judgeId: true,
        timeSlot: true,
        startTime: true,
        case: { select: { ucn: true } },
        courtroom: { select: { name: true } },
      },
      orderBy: [{ timeSlot: 'asc' }],
    });

    let sent = 0;
    let alreadySent = 0;
    await this.prisma.$transaction(
      async (tx) => {
        // One run at a time per day: a second, parallel run waits here and then finds every reminder sent.
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`hearing-reminders:${isoDate(tomorrow)}`}))) AS l`;
        for (const h of hearings) {
          const audience = [...new Set([...(await caseAudience(tx, h.caseId)), h.judgeId])];
          const existing = await tx.hearingReminder.findMany({
            where: { hearingId: h.id, hearingDate: tomorrow, userId: { in: audience } },
            select: { userId: true },
          });
          const done = new Set(existing.map((e) => e.userId));
          const due = audience.filter((u) => !done.has(u));
          alreadySent += done.size;
          if (due.length === 0) continue;
          await tx.hearingReminder.createMany({
            data: due.map((userId) => ({ hearingId: h.id, userId, hearingDate: tomorrow })),
            skipDuplicates: true,
          });
          const time = h.startTime ?? slots.find((s) => s.slot === h.timeSlot)?.start ?? '';
          const courtroom = h.courtroom?.name;
          await this.notifications.notifyMany(
            due,
            courtroom
              ? notice(
                  'HEARING_REMINDER',
                  'Hearing reminder',
                  'Reminder: your hearing for {{ucn}} is tomorrow at {{time}} in {{courtroom}}.',
                  { ucn: h.case.ucn, time, courtroom },
                )
              : notice(
                  'HEARING_REMINDER',
                  'Hearing reminder',
                  'Reminder: your hearing for {{ucn}} is tomorrow at {{time}}.',
                  { ucn: h.case.ucn, time },
                ),
            tx,
          );
          sent += due.length;
        }
        await this.audit.logWithin(tx, {
          action: REMINDER_AUDIT_ACTION,
          actorId: actor?.id ?? null,
          actorRole: actor?.role ?? null,
          entity: 'Hearing',
          metadata: {
            date: isoDate(tomorrow),
            hearings: hearings.length,
            sent,
            alreadySent,
            trigger,
          },
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        });
      },
      { timeout: 60_000 },
    );
    return { date: isoDate(tomorrow), hearings: hearings.length, sent, alreadySent };
  }
}
