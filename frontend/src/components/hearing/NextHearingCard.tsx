import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarX2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { relativeHearing, useNow } from '@/lib/hearing-time';
import { PORTALS, portalPath } from '@/lib/navigation';
import {
  addDaysIso,
  isoToDdMmYyyy,
  schedulingApi,
  todayIso,
  weekdayName,
  type HearingView,
} from '@/lib/scheduling-api';
import { JoinRoomButton, VirtualBadge } from '@/pages/virtual/JoinRoomButton';
import { AddToCalendar } from './AddToCalendar';

/** The next scheduled hearing of the signed-in user (party or lawyer: their cases; judge: their bench). */
function useNextHearing() {
  const { user } = useAuth();
  const judge = user?.role === 'JUDGE';
  return useQuery({
    queryKey: ['hearings', 'next', judge ? 'judge' : 'mine'],
    enabled: Boolean(user),
    queryFn: async (): Promise<HearingView | null> => {
      if (judge) {
        const today = todayIso();
        const res = await schedulingApi.judgeHearings({ from: today, to: addDaysIso(today, 30) });
        return res.data.find((h) => h.status === 'SCHEDULED') ?? null;
      }
      const res = await schedulingApi.myHearings({ when: 'upcoming', page: 1, limit: 5 });
      return res.data.find((h) => h.status === 'SCHEDULED') ?? null;
    },
  });
}

/**
 * "Next hearing" card for litigant, lawyer and judge dashboards: a live countdown in the reader's language
 * (updated every minute without refetching), the courtroom, Add to calendar, and the join button for a
 * virtual hearing (it stays disabled with the lobby message until the room opens).
 */
export function NextHearingCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const now = useNow();
  const { data: next, isPending, isError, refetch } = useNextHearing();
  if (!user) return null;
  const portal = PORTALS[user.role];
  const judge = user.role === 'JUDGE';
  const casePath = (h: HearingView) =>
    judge ? `/judge/cases/${h.caseId}` : portalPath(portal, `cases/${h.caseId}`);

  return (
    <Card data-tour="next-hearing">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" aria-hidden="true" /> {t('Next hearing')}
        </CardTitle>
      </CardHeader>
      {isPending ? (
        <CardContent className="space-y-2" aria-busy="true">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
          <span className="sr-only">{t('Loading')}</span>
        </CardContent>
      ) : isError ? (
        <CardContent>
          <p className="text-sm text-text-muted">{t('The next hearing could not be loaded.')}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-sm font-semibold text-primary underline"
          >
            {t('Try again')}
          </button>
        </CardContent>
      ) : next ? (
        <CardContent className="space-y-3">
          <div>
            <p className="text-xl font-bold text-text">
              {relativeHearing(next.date, next.startTime, now, t)}
            </p>
            <p className="text-sm text-text-muted">
              {[
                `${weekdayName(next.date)} ${isoToDdMmYyyy(next.date)}`,
                next.courtroom?.name,
                judge ? null : next.judge.name,
              ]
                .filter(Boolean)
                .map((part, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    <bdi>{part}</bdi>
                  </span>
                ))}
            </p>
          </div>
          <p className="flex flex-wrap items-center gap-2">
            <Link
              to={casePath(next)}
              className="case-number whitespace-nowrap text-sm font-medium"
              dir="ltr"
            >
              {next.ucn}
            </Link>
            <span className="text-sm">
              <bdi>{next.title}</bdi>
            </span>
            {next.isVirtual && <VirtualBadge />}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {next.isVirtual && <JoinRoomButton hearingId={next.id} />}
            <AddToCalendar
              hearing={{
                id: next.id,
                ucn: next.ucn,
                date: next.date,
                startTime: next.startTime,
                endTime: next.endTime,
                courtroom: next.courtroom?.name,
                isVirtual: next.isVirtual,
              }}
              casePath={casePath(next)}
            />
          </div>
          <Link
            to={judge ? '/judge/schedule' : portalPath(portal, 'hearings')}
            className="inline-block text-sm font-semibold"
          >
            {judge ? t('My full schedule') : t('Full hearing schedule')}
          </Link>
        </CardContent>
      ) : (
        <EmptyState
          icon={CalendarX2}
          title={t('No upcoming hearings')}
          description={
            judge
              ? t('Hearings fixed before you in the next 30 days will appear here.')
              : t('No upcoming hearings have been scheduled for your cases yet.')
          }
        />
      )}
    </Card>
  );
}

/** Compact chip for case cards: "Next hearing: Tomorrow at 10:30". */
export function NextHearingChip({
  date,
  startTime,
  className,
}: {
  date: string;
  startTime: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const now = useNow();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-status-hearing-border bg-status-hearing-bg px-2 py-0.5 text-xs font-medium text-status-hearing-fg ${className ?? ''}`}
    >
      <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="sr-only">{t('Next hearing')}: </span>
        {relativeHearing(date, startTime, now, t)}
      </span>
    </span>
  );
}
