import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarX2, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const STATUS: Record<
  HearingStatus,
  { variant: 'hearing' | 'pending' | 'decided' | 'rejected'; label: string }
> = {
  SCHEDULED: { variant: 'hearing', label: 'Scheduled' },
  ADJOURNED: { variant: 'pending', label: 'Adjourned' },
  HELD: { variant: 'decided', label: 'Completed' },
  CANCELLED: { variant: 'rejected', label: 'Cancelled' },
};

export function HearingStatusBadge({ status }: { status: HearingStatus }) {
  const { variant, label } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const PAGE_SIZE = 10;

/** UC-3.1 View Upcoming Hearing Schedule (litigants and lawyers). */
export function HearingSchedulePage() {
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
        title="Hearing Schedule"
        description="Hearing dates, courtrooms, timings and benches for your cases."
        crumbs={[{ label: 'Dashboard', to: portalPath(portal, '') }, { label: 'Hearing Schedule' }]}
      />
      <Tabs
        value={when}
        onValueChange={(v) => {
          setWhen(v as 'upcoming' | 'past');
          setPage(1);
        }}
      >
        <TabsList aria-label="Hearings">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
      </Tabs>
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
                  ? 'No upcoming hearings have been scheduled for your cases yet.'
                  : 'No past hearings.'
              }
              description="You will be notified as soon as a hearing is fixed or changed."
            />
          </Card>
        ) : (
          data && (
            <>
              <Table aria-label={`${when} hearings`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Courtroom</TableHead>
                    <TableHead>Bench</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {isoToDdMmYyyy(h.date)}
                        <span className="block text-sm font-normal text-text-muted">
                          {h.weekday}
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
                        <span className="block">{h.title}</span>
                      </TableCell>
                      <TableCell className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          <HearingStatusBadge status={h.status} />
                          {h.isVirtual && <VirtualBadge />}
                        </div>
                        {h.isVirtual && when === 'upcoming' && h.status === 'SCHEDULED' && (
                          <JoinRoomButton hearingId={h.id} />
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
    </>
  );
}

/** UC-3.2 Access Daily Cause Lists (litigants, lawyers and judges). */
export function CauseListsPage() {
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
        title="Daily Cause Lists"
        description="The published court rosters for a day. Your own cases are highlighted."
        crumbs={[
          { label: 'Dashboard', to: portalPath(portal, '') },
          { label: 'Daily Cause Lists' },
        ]}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Field label="Date">
          {(p) => (
            <Input
              type="date"
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
        <Field label="Courtroom">
          {(p) => (
            <NativeSelect
              value={courtroomId}
              onChange={(e) => setCourtroomId(e.target.value)}
              disabled={rooms.length === 0}
              {...p}
            >
              <option value="">All courtrooms</option>
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
            title={data.message ?? 'Roster details not yet published. Check back later.'}
            description={`No cause list is published for ${isoToDdMmYyyy(date)} (${weekdayName(date)}).`}
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
                    <EmptyState icon={ClipboardList} title="No listings for this courtroom" />
                  ) : (
                    <div className="p-5">
                      <Table aria-label={`Cause list, ${l.court}`}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Serial</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Courtroom</TableHead>
                            <TableHead>Case</TableHead>
                            <TableHead>Judge</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((e) => (
                            <TableRow
                              key={e.ucn}
                              className={cn(
                                e.isMine && 'border-l-4 border-l-accent bg-accent-soft',
                              )}
                            >
                              <TableCell className="font-mono">{e.serialNo}</TableCell>
                              <TableCell className="font-mono">{e.time}</TableCell>
                              <TableCell>{e.courtroom}</TableCell>
                              <TableCell className="min-w-48">
                                <span className="case-number block font-medium">{e.ucn}</span>
                                {e.title}
                                <span className="mt-1 flex flex-wrap gap-1">
                                  {e.isMine && <Badge variant="accent">Your case</Badge>}
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
        title="My Schedule"
        description="Your hearings for the week."
        crumbs={[{ label: 'Dashboard', to: '/judge' }, { label: 'My Schedule' }]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFrom(addDaysIso(from, -7))}
          className="min-h-10 rounded-md border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          Previous week
        </button>
        <span className="font-semibold">
          {isoToDdMmYyyy(from)} to {isoToDdMmYyyy(to)}
        </span>
        <button
          type="button"
          onClick={() => setFrom(addDaysIso(from, 7))}
          className="min-h-10 rounded-md border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          Next week
        </button>
        <button
          type="button"
          onClick={() => setFrom(mondayIso(todayIso()))}
          className="min-h-10 rounded-md px-3 text-sm font-semibold hover:bg-primary-soft"
        >
          This week
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
                <EmptyState icon={CalendarX2} title="No hearings this week" />
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
                          <span className="block font-semibold">{h.title}</span>
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

/** Dashboard card for litigants and lawyers: the next hearing across their cases. */
export function NextHearingCard() {
  const { user } = useAuth();
  const { data, isPending } = useQuery({
    queryKey: ['hearings', 'mine', 'upcoming', 1],
    queryFn: () => schedulingApi.myHearings({ when: 'upcoming', page: 1, limit: PAGE_SIZE }),
    enabled: Boolean(user),
  });
  if (!user) return null;
  const portal = PORTALS[user.role];
  const next = data?.data[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" aria-hidden="true" /> Next hearing
        </CardTitle>
      </CardHeader>
      {isPending ? (
        <CardContent>
          <Skeleton className="h-16" />
        </CardContent>
      ) : next ? (
        <CardContent className="space-y-1">
          <p className="text-2xl font-bold">
            {isoToDdMmYyyy(next.date)} <span className="font-mono text-lg">{next.startTime}</span>
          </p>
          <p className="text-text-muted">
            {next.weekday} · {next.courtroom?.name} · {next.judge.name}
          </p>
          <p>
            <span className="case-number text-sm font-medium text-primary">{next.ucn}</span>{' '}
            {next.title}
          </p>
          <Link
            to={portalPath(portal, 'hearings')}
            className="inline-block pt-1 text-sm font-semibold"
          >
            Full hearing schedule
          </Link>
        </CardContent>
      ) : (
        <EmptyState
          icon={CalendarX2}
          title="No upcoming hearings"
          description="No upcoming hearings have been scheduled for your cases yet."
        />
      )}
    </Card>
  );
}
