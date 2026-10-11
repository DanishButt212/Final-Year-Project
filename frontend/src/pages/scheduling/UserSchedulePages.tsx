import { AddToCalendar } from '@/components/hearing/AddToCalendar';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarX2, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseApiError } from '@/lib/api';
import { PORTALS, portalPath } from '@/lib/navigation';
import {
  addDaysIso,
  isoToDdMmYyyy,
  mondayIso,
  schedulingApi,
  todayIso,
  weekdayName,
  type HearingStatus,
  type HearingView,
} from '@/lib/scheduling-api';
import { cn } from '@/lib/utils';
import { JoinRoomButton, VirtualBadge } from '@/pages/virtual/JoinRoomButton';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const STATUS: Record<
  HearingStatus,
  { variant: 'hearing' | 'pending' | 'decided' | 'rejected'; label: string }
> = {
  SCHEDULED: { variant: 'hearing', label: msg('Scheduled') },
  ADJOURNED: { variant: 'pending', label: msg('Adjourned') },
  HELD: { variant: 'decided', label: msg('Completed') },
  CANCELLED: { variant: 'rejected', label: msg('Cancelled') },
};

export function HearingStatusBadge({ status }: { status: HearingStatus }) {
  const { variant, label } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const PAGE_SIZE = 10;

/** UC-3.1 View Upcoming Hearing Schedule (litigants and lawyers). */
export function HearingSchedulePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['hearings', 'mine', when, page],
    queryFn: () => schedulingApi.myHearings({ when, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  });
  if (!user) return null;
  const portal = PORTALS[user.role];

  return (
    <>
      <PageHeader
        title={t('Hearing Schedule')}
        description={t('Hearing dates, courtrooms, timings and benches for your cases.')}
        crumbs={[
          { label: t('Dashboard'), to: portalPath(portal, '') },
          { label: t('Hearing Schedule') },
        ]}
      />
      <Tabs
        value={when}
        onValueChange={(v) => {
          setWhen(v as 'upcoming' | 'past');
          setPage(1);
        }}
      >
        <TabsList aria-label={t('Hearings')}>
          <TabsTrigger value="upcoming">{t('Upcoming')}</TabsTrigger>
          <TabsTrigger value="past">{t('Past')}</TabsTrigger>
        </TabsList>
        {(['upcoming', 'past'] as const).map((tab) => (
          // Both panels exist (only the active one is shown), so each tab controls a real panel.
          <TabsContent key={tab} value={tab} forceMount className="pt-0">
            {when === tab && (
              <div className="mt-5">
                {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
                {isPending ? (
                  <TableSkeleton rows={5} cols={6} />
                ) : data && data.data.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={CalendarX2}
                      title={
                        when === 'upcoming'
                          ? t('No upcoming hearings have been scheduled for your cases yet.')
                          : t('No past hearings.')
                      }
                      description={t(
                        'You will be notified as soon as a hearing is fixed or changed.',
                      )}
                    />
                  </Card>
                ) : (
                  data && (
                    <>
                      <Table aria-label={`${when} hearings`}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('Date')}</TableHead>
                            <TableHead>{t('Time')}</TableHead>
                            <TableHead>{t('Courtroom')}</TableHead>
                            <TableHead>{t('Bench')}</TableHead>
                            <TableHead>{t('Case')}</TableHead>
                            <TableHead>{t('Status')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.data.map((h) => (
                            <TableRow key={h.id}>
                              <TableCell className="whitespace-nowrap font-medium">
                                {isoToDdMmYyyy(h.date)}
                                <span className="block text-sm font-normal text-text-muted">
                                  {weekdayName(h.date)}
                                </span>
                              </TableCell>
                              <TableCell className="whitespace-nowrap font-mono">
                                {h.startTime}
                                {h.endTime && `–${h.endTime}`}
                              </TableCell>
                              <TableCell>{h.courtroom?.name ?? '—'}</TableCell>
                              <TableCell>{h.judge.name}</TableCell>
                              <TableCell className="min-w-48">
                                <Link
                                  to={portalPath(portal, `cases/${h.caseId}`)}
                                  className="case-number font-medium"
                                >
                                  {h.ucn}
                                </Link>
                                <span className="block">
                                  <bdi>{h.title}</bdi>
                                </span>
                              </TableCell>
                              <TableCell className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  <HearingStatusBadge status={h.status} />
                                  {h.isVirtual && <VirtualBadge />}
                                </div>
                                {h.isVirtual && when === 'upcoming' && h.status === 'SCHEDULED' && (
                                  <JoinRoomButton hearingId={h.id} />
                                )}
                                {when === 'upcoming' && h.status === 'SCHEDULED' && (
                                  <AddToCalendar
                                    hearing={{
                                      id: h.id,
                                      ucn: h.ucn,
                                      date: h.date,
                                      startTime: h.startTime,
                                      endTime: h.endTime,
                                      courtroom: h.courtroom?.name,
                                      isVirtual: h.isVirtual,
                                    }}
                                    casePath={portalPath(portal, `cases/${h.caseId}`)}
                                  />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <Pagination
                        page={data.meta.page}
                        totalPages={data.meta.totalPages}
                        total={data.meta.total}
                        onPageChange={setPage}
                      />
                    </>
                  )
                )}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

/** UC-3.2 Access Daily Cause Lists (litigants, lawyers and judges). */
export function CauseListsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [courtroomId, setCourtroomId] = useState('');
  const all = useQuery({
    queryKey: ['cause-lists', date],
    queryFn: () => schedulingApi.causeLists({ date }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  });
  if (!user) return null;
  const portal = PORTALS[user.role];
  const data = all.data;
  const rooms = data?.courtrooms ?? [];

  return (
    <>
      <PageHeader
        title={t('Daily Cause Lists')}
        description={t('The published court rosters for a day. Your own cases are highlighted.')}
        crumbs={[
          { label: t('Dashboard'), to: portalPath(portal, '') },
          { label: t('Daily Cause Lists') },
        ]}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Field label={t('Date')}>
          {(p) => (
            <DatePicker
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setCourtroomId('');
                }
              }}
              {...p}
            />
          )}
        </Field>
        <Field label={t('Courtroom')}>
          {(p) => (
            <NativeSelect
              value={courtroomId}
              onChange={(e) => setCourtroomId(e.target.value)}
              disabled={rooms.length === 0}
              {...p}
            >
              <option value="">{t('All courtrooms')}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      {all.isError && <Alert variant="error">{parseApiError(all.error).message}</Alert>}
      {all.isPending ? (
        <TableSkeleton rows={5} cols={6} />
      ) : data && !data.published ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={data.message ?? t('Roster details not yet published. Check back later.')}
            description={t('No cause list is published for {{isoToDdMmYyyy}} ({{weekdayName}}).', {
              isoToDdMmYyyy: isoToDdMmYyyy(date),
              weekdayName: weekdayName(date),
            })}
          />
        </Card>
      ) : (
        data && (
          <div className="space-y-6">
            {data.lists.map((l) => {
              const rows = l.entries.filter((e) => !courtroomId || e.courtroomId === courtroomId);
              return (
                <Card key={l.courtId}>
                  <CardHeader>
                    <CardTitle>{l.court}</CardTitle>
                    <p className="text-sm text-text-muted">
                      {weekdayName(date)} {isoToDdMmYyyy(date)}
                    </p>
                  </CardHeader>
                  {rows.length === 0 ? (
                    <EmptyState icon={ClipboardList} title={t('No listings for this courtroom')} />
                  ) : (
                    <div className="p-5">
                      <Table aria-label={t('Cause list, {{court}}', { court: l.court })}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('Serial')}</TableHead>
                            <TableHead>{t('Time')}</TableHead>
                            <TableHead>{t('Courtroom')}</TableHead>
                            <TableHead>{t('Case')}</TableHead>
                            <TableHead>{t('Judge')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((e) => (
                            <TableRow
                              key={e.ucn}
                              className={cn(
                                e.isMine && 'border-s-4 border-l-accent bg-accent-soft',
                              )}
                            >
                              <TableCell className="font-mono">{e.serialNo}</TableCell>
                              <TableCell className="font-mono">{e.time}</TableCell>
                              <TableCell>{e.courtroom}</TableCell>
                              <TableCell className="min-w-48">
                                <span className="case-number block font-medium">{e.ucn}</span>
                                {e.title}
                                <span className="mt-1 flex flex-wrap gap-1">
                                  {e.isMine && <Badge variant="accent">{t('Your case')}</Badge>}
                                  {e.isVirtual && <VirtualBadge />}
                                </span>
                                {e.isMine && e.isVirtual && e.status === 'SCHEDULED' && (
                                  <div className="mt-2">
                                    <JoinRoomButton hearingId={e.hearingId} />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>{e.judge}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}
    </>
  );
}

/** Judge "My Schedule": a week of hearings, day by day. */
export function JudgeSchedulePage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(mondayIso(todayIso()));
  const to = addDaysIso(from, 6);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['hearings', 'judge', from],
    queryFn: () => schedulingApi.judgeHearings({ from, to }),
    placeholderData: keepPreviousData,
  });
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));

  return (
    <>
      <PageHeader
        title={t('My Schedule')}
        description={t('Your hearings for the week.')}
        crumbs={[{ label: t('Dashboard'), to: '/judge' }, { label: t('My Schedule') }]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFrom(addDaysIso(from, -7))}
          className="min-h-10 rounded-md border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          {t('Previous week')}
        </button>
        <span className="font-semibold">
          {t('{{isoToDdMmYyyy}} to {{isoToDdMmYyyy2}}', {
            isoToDdMmYyyy: isoToDdMmYyyy(from),
            isoToDdMmYyyy2: isoToDdMmYyyy(to),
          })}
        </span>
        <button
          type="button"
          onClick={() => setFrom(addDaysIso(from, 7))}
          className="min-h-10 rounded-md border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          {t('Next week')}
        </button>
        <button
          type="button"
          onClick={() => setFrom(mondayIso(todayIso()))}
          className="min-h-10 rounded-md px-3 text-sm font-semibold hover:bg-primary-soft"
        >
          {t('This week')}
        </button>
      </div>
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-64" />
      ) : (
        data && (
          <div className="space-y-4">
            {data.data.length === 0 && (
              <Card>
                <EmptyState icon={CalendarX2} title={t('No hearings this week')} />
              </Card>
            )}
            {days.map((d) => {
              const rows: HearingView[] = data.data.filter((h) => h.date === d);
              if (rows.length === 0) return null;
              return (
                <Card key={d}>
                  <CardHeader>
                    <CardTitle as="h3">
                      {weekdayName(d)} {isoToDdMmYyyy(d)}
                    </CardTitle>
                  </CardHeader>
                  <ul className="divide-y divide-border">
                    {rows.map((h) => (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                      >
                        <span>
                          <span className="font-mono text-sm">{h.startTime}</span>{' '}
                          <span className="case-number text-sm font-medium text-primary">
                            {h.ucn}
                          </span>
                          <span className="block font-semibold">
                            <bdi>{h.title}</bdi>
                          </span>
                          <span className="block text-sm text-text-muted">{h.courtroom?.name}</span>
                        </span>
                        <span className="flex flex-col items-end gap-2">
                          <span className="flex flex-wrap gap-1">
                            <HearingStatusBadge status={h.status} />
                            {h.isVirtual && <VirtualBadge />}
                          </span>
                          {h.isVirtual && h.status === 'SCHEDULED' && d >= todayIso() && (
                            <JoinRoomButton hearingId={h.id} />
                          )}
                          {h.status === 'SCHEDULED' && d >= todayIso() && (
                            <AddToCalendar
                              hearing={{
                                id: h.id,
                                ucn: h.ucn,
                                date: h.date,
                                startTime: h.startTime,
                                endTime: h.endTime,
                                courtroom: h.courtroom?.name,
                                isVirtual: h.isVirtual,
                              }}
                              casePath={`/judge/cases/${h.caseId}`}
                            />
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )
      )}
    </>
  );
}
