import {
  CaseStatus,
  ChallanStatus,
  DecisionType,
  HearingStatus,
  PaymentStatus,
  Prisma,
} from '../generated/prisma/client';
import { pkIsoDate } from '../common/pk-time';

/**
 * Case progress: Filed -> Fee Paid -> Allocated -> Hearing -> Decided.
 *
 * The single place where a case's stage is derived from its case, challan, allocation, hearing and decision
 * data. Used by the case detail and list responses of every role and by the public case status endpoint,
 * so the stepper means the same thing everywhere.
 */
export const PROGRESS_STAGES = ['FILED', 'FEE_PAID', 'ALLOCATED', 'HEARING', 'DECIDED'] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];
export type StageState = 'completed' | 'current' | 'upcoming';

/** Case statuses that end the case without a decision (rejected at scrutiny or dismissed). */
export const TERMINAL_STATUSES: CaseStatus[] = ['REJECTED', 'DISMISSED'];

export interface ProgressHearing {
  date: string; // YYYY-MM-DD
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  timeSlot: number;
  courtroom: string | null;
  isVirtual: boolean;
}

export type ProgressDetail =
  | { kind: 'AWAITING_FEE' }
  | { kind: 'AWAITING_ALLOCATION' }
  | { kind: 'AWAITING_HEARING_DATE' }
  | { kind: 'NEXT_HEARING'; hearing: ProgressHearing }
  | { kind: 'ADJOURNED'; hearing: ProgressHearing }
  | { kind: 'DECIDED'; decisionType: DecisionType | null }
  | { kind: 'CLOSED'; status: CaseStatus };

export interface CaseProgress {
  stages: { key: ProgressStage; state: StageState; date: string | null }[];
  /** The stage in progress, or null when the case is decided or closed. */
  current: ProgressStage | null;
  /** Set when the case ended without a decision (REJECTED or DISMISSED). */
  terminal: CaseStatus | null;
  detail: ProgressDetail;
  nextHearing: ProgressHearing | null;
}

/** The minimum a caller must load to compute progress (see progressSelect). */
export interface ProgressSource {
  status: CaseStatus;
  filingDate: Date | null;
  createdAt: Date;
  allocatedAt: Date | null;
  decidedAt: Date | null;
  decisionType: DecisionType | null;
  challans: {
    status: ChallanStatus;
    payments: { status: PaymentStatus; paidAt: Date | null }[];
  }[];
  hearings: {
    date: Date;
    startTime: string | null;
    timeSlot: number;
    status: HearingStatus;
    isVirtual: boolean;
    courtroom: { name: string } | null;
  }[];
}

/** Prisma select fragment that loads exactly what computeProgress needs. */
export const progressSelect = {
  status: true,
  filingDate: true,
  createdAt: true,
  allocatedAt: true,
  decidedAt: true,
  decisionType: true,
  challans: {
    select: {
      status: true,
      payments: { where: { status: 'SUCCESS' }, select: { status: true, paidAt: true } },
    },
  },
  hearings: {
    where: { status: { not: 'CANCELLED' } },
    orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
    select: {
      date: true,
      startTime: true,
      timeSlot: true,
      status: true,
      isVirtual: true,
      courtroom: { select: { name: true } },
    },
  },
} satisfies Prisma.CaseSelect;

const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** Instants (payments, allocation, decision) as the Pakistan calendar date. */
const pkDay = (d: Date | null | undefined) => (d ? pkIsoDate(d) : null);

function addMinutes(hhmm: string | null, minutes: number): string | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * @param slotMinutes length of a hearing slot (court policy), used for the end time
 * @param today Pakistan date YYYY-MM-DD (injectable for tests)
 */
export function computeProgress(
  c: ProgressSource,
  slotMinutes: number,
  today: string = pkIsoDate(new Date()),
): CaseProgress {
  const toHearing = (h: ProgressSource['hearings'][number]): ProgressHearing => ({
    date: isoDay(h.date)!,
    startTime: h.startTime,
    endTime: addMinutes(h.startTime, slotMinutes),
    timeSlot: h.timeSlot,
    courtroom: h.courtroom?.name ?? null,
    isVirtual: h.isVirtual,
  });

  const hearings = c.hearings.filter((h) => h.status !== 'CANCELLED');
  const next = hearings.find((h) => h.status === 'SCHEDULED' && isoDay(h.date)! >= today) ?? null;
  const past = hearings.filter((h) => h.status === 'HELD' || h.status === 'ADJOURNED');
  const lastPast = past.at(-1) ?? null;

  const paidDates = c.challans
    .filter((ch) => ch.status === 'PAID')
    .flatMap((ch) => ch.payments.map((p) => p.paidAt))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime());
  const feePaid = c.challans.some((ch) => ch.status === 'PAID');

  const decided = c.status === 'DECIDED' || Boolean(c.decidedAt);
  const allocated = Boolean(c.allocatedAt) || decided;
  const heard = hearings.length > 0;

  // A later stage implies the earlier ones (older data may lack, for example, a challan row).
  const done: Record<ProgressStage, boolean> = {
    FILED: c.status !== 'DRAFT',
    FEE_PAID: feePaid || allocated,
    ALLOCATED: allocated,
    HEARING: decided,
    DECIDED: decided,
  };
  const dates: Record<ProgressStage, string | null> = {
    FILED: isoDay(c.filingDate) ?? pkDay(c.createdAt),
    FEE_PAID: pkDay(paidDates[0]),
    ALLOCATED: pkDay(c.allocatedAt),
    HEARING: heard ? isoDay(hearings[0].date) : null,
    DECIDED: pkDay(c.decidedAt),
  };

  const terminal = TERMINAL_STATUSES.includes(c.status) && !decided ? c.status : null;
  const current: ProgressStage | null =
    terminal || decided ? null : (PROGRESS_STAGES.find((s) => !done[s]) ?? null);

  const stages = PROGRESS_STAGES.map((key) => ({
    key,
    state: (done[key] ? 'completed' : key === current ? 'current' : 'upcoming') as StageState,
    date: done[key] || key === current ? dates[key] : null,
  }));

  let detail: ProgressDetail;
  if (terminal) detail = { kind: 'CLOSED', status: terminal };
  else if (decided) detail = { kind: 'DECIDED', decisionType: c.decisionType };
  else if (current === 'FILED' || current === 'FEE_PAID') detail = { kind: 'AWAITING_FEE' };
  else if (current === 'ALLOCATED') detail = { kind: 'AWAITING_ALLOCATION' };
  else if (next && lastPast?.status === 'ADJOURNED')
    detail = { kind: 'ADJOURNED', hearing: toHearing(next) };
  else if (next) detail = { kind: 'NEXT_HEARING', hearing: toHearing(next) };
  else detail = { kind: 'AWAITING_HEARING_DATE' };

  return {
    stages,
    current,
    terminal,
    detail,
    nextHearing: next && !terminal && !decided ? toHearing(next) : null,
  };
}
