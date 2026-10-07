import { Injectable } from '@nestjs/common';
import { AuthUser } from '../common/decorators';
import { pageMeta } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { fullName } from '../admin/constants';
import { CauseListQueryDto, JudgeHearingsQueryDto, MyHearingsQueryDto } from './scheduling.dto';
import { scanInclude } from './scheduling.engine';
import { hearingView } from './scheduling.service';
import { addDays, buildSlots, isoDate, mondayOf, requireDate, todayUtc } from './slots';

export const NOT_PUBLISHED_MESSAGE = 'Roster details not yet published. Check back later.';

/** Read side for litigants, lawyers and judges: their hearings and the published daily cause lists. */
@Injectable()
export class HearingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Cases the user is party to: filed by them, or they are counsel on a party. */
  private async mineWhere(user: AuthUser): Promise<Prisma.CaseWhereInput> {
    const or: Prisma.CaseWhereInput[] = [{ filedById: user.id }];
    if (user.role === 'LAWYER') {
      const profile = await this.prisma.lawyerProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (profile) or.push({ parties: { some: { lawyerId: profile.id } } });
    }
    return { OR: or };
  }

  /** UC-3.1 View Upcoming Hearing Schedule. */
  async mine(user: AuthUser, q: MyHearingsQueryDto) {
    const slots = buildSlots(await this.settings.schedulePolicy());
    const today = todayUtc();
    const upcoming = q.when === 'upcoming';
    const where: Prisma.HearingWhereInput = {
      case: await this.mineWhere(user),
      ...(upcoming
        ? { date: { gte: today }, status: { in: ['SCHEDULED', 'ADJOURNED'] } }
        : { OR: [{ date: { lt: today } }, { status: { in: ['HELD', 'CANCELLED'] } }] }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.hearing.count({ where }),
      this.prisma.hearing.findMany({
        where,
        include: scanInclude,
        orderBy: upcoming
          ? [{ date: 'asc' }, { timeSlot: 'asc' }]
          : [{ date: 'desc' }, { timeSlot: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return {
      data: rows.map((h) => hearingView(h, slots)),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  /** The judge's own schedule between two dates (default: this week). */
  async judge(user: AuthUser, q: JudgeHearingsQueryDto) {
    const slots = buildSlots(await this.settings.schedulePolicy());
    const from = q.from ? requireDate(q.from, 'from') : mondayOf(todayUtc());
    const to = q.to ? requireDate(q.to, 'to') : addDays(from, 6);
    const rows = await this.prisma.hearing.findMany({
      where: { judgeId: user.id, date: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      include: scanInclude,
      orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
      take: 500,
    });
    return { from: isoDate(from), to: isoDate(to), data: rows.map((h) => hearingView(h, slots)) };
  }

  /** UC-3.2 Access Daily Cause Lists: published lists for one date, with the user's own rows flagged. */
  async causeLists(user: AuthUser, q: CauseListQueryDto) {
    const date = q.date ? requireDate(q.date) : todayUtc();
    const lists = await this.prisma.causeList.findMany({
      where: { date, status: 'PUBLISHED', ...(q.courtId ? { courtId: q.courtId } : {}) },
      include: {
        court: { select: { id: true, name: true } },
        entries: {
          orderBy: { serialNo: 'asc' },
          include: { hearing: { include: scanInclude } },
        },
      },
      orderBy: { court: { name: 'asc' } },
    });
    if (lists.length === 0) {
      return {
        published: false,
        message: NOT_PUBLISHED_MESSAGE,
        date: isoDate(date),
        courtrooms: [],
        lists: [],
      };
    }
    const slots = buildSlots(await this.settings.schedulePolicy());
    let myLawyerId: string | null = null;
    if (user.role === 'LAWYER') {
      myLawyerId =
        (
          await this.prisma.lawyerProfile.findUnique({
            where: { userId: user.id },
            select: { id: true },
          })
        )?.id ?? null;
    }
    const courtrooms = new Map<string, string>();
    const out = lists.map((l) => {
      for (const e of l.entries) {
        if (e.hearing.courtroom) courtrooms.set(e.hearing.courtroom.id, e.hearing.courtroom.name);
      }
      return {
        courtId: l.court.id,
        court: l.court.name,
        publishedAt: l.publishedAt,
        entries: l.entries
          .filter((e) => !q.courtroomId || e.hearing.courtroomId === q.courtroomId)
          .map((e) => {
            const h = e.hearing;
            const v = hearingView(h, slots);
            return {
              hearingId: h.id,
              isVirtual: h.isVirtual,
              serialNo: e.serialNo,
              time: v.startTime,
              courtroom: v.courtroom?.name ?? null,
              courtroomId: v.courtroom?.id ?? null,
              judge: fullName(h.judge),
              ucn: h.case.ucn,
              title: h.case.title,
              status: h.status,
              isMine:
                h.case.filedById === user.id ||
                h.judgeId === user.id ||
                (myLawyerId !== null && h.case.parties.some((p) => p.lawyerId === myLawyerId)),
            };
          }),
      };
    });
    return {
      published: true,
      date: isoDate(date),
      courtrooms: [...courtrooms]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      lists: out,
    };
  }
}
