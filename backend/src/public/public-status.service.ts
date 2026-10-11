import { Injectable, NotFoundException } from '@nestjs/common';
import { computeProgress, progressSelect } from '../cases/case-progress';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityService } from '../security/security.service';
import { SettingsService } from '../settings/settings.service';

export const CASE_NOT_FOUND_MESSAGE = 'No case found with this UCN.';

/**
 * Public case status (no login). Returns ONLY non-sensitive progress: UCN, category, court, stage and stage
 * dates, filing date and the next hearing. Never parties, CNICs, lawyers, the judge, documents, amounts,
 * evidence or summons. The response is built field by field (never spread from a database row), so a new
 * column can never leak through it.
 */
@Injectable()
export class PublicStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly security: SecurityService,
  ) {}

  async lookup(ucn: string, ip: string | undefined) {
    const c = await this.prisma.case.findUnique({
      where: { ucn },
      select: {
        ucn: true,
        caseType: true,
        court: { select: { name: true } },
        ...progressSelect,
        hearings: {
          ...progressSelect.hearings,
          select: {
            ...progressSelect.hearings.select,
            id: true,
            causeListEntry: { select: { causeList: { select: { status: true } } } },
          },
        },
      },
    });
    // Drafts are private to their author: they do not exist publicly.
    if (!c || c.status === 'DRAFT') {
      await this.security.recordStatusProbe(ip);
      throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: CASE_NOT_FOUND_MESSAGE });
    }

    const policy = await this.settings.schedulePolicy();
    const progress = computeProgress(c, policy.hearingSlotMinutes);
    // The date of the next hearing is public; its time and courtroom only once the cause list is published.
    const nextRow = progress.nextHearing
      ? c.hearings.find(
          (h) =>
            h.date.toISOString().slice(0, 10) === progress.nextHearing!.date &&
            h.timeSlot === progress.nextHearing!.timeSlot,
        )
      : undefined;
    const published = nextRow?.causeListEntry?.causeList.status === 'PUBLISHED';
    const nextHearing = progress.nextHearing
      ? {
          date: progress.nextHearing.date,
          published,
          startTime: published ? progress.nextHearing.startTime : null,
          endTime: published ? progress.nextHearing.endTime : null,
          timeSlot: published ? progress.nextHearing.timeSlot : null,
          courtroom: published ? progress.nextHearing.courtroom : null,
          isVirtual: progress.nextHearing.isVirtual,
        }
      : null;
    const detail =
      progress.detail.kind === 'NEXT_HEARING' || progress.detail.kind === 'ADJOURNED'
        ? { kind: progress.detail.kind, hearing: nextHearing }
        : progress.detail;

    return {
      ucn: c.ucn,
      caseType: c.caseType,
      court: c.court?.name ?? null,
      filingDate: progress.stages[0].date,
      stage: progress.terminal ?? progress.current ?? 'DECIDED',
      progress: {
        stages: progress.stages,
        current: progress.current,
        terminal: progress.terminal,
        detail,
      },
      nextHearing,
    };
  }
}
