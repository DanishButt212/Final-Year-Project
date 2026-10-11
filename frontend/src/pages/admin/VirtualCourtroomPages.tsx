import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  DoorOpen,
  MicOff,
  PhoneOff,
  Radio,
  UserCheck,
  Video,
  VideoOff,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { isoToDdMmYyyy } from '@/lib/scheduling-api';
import {
  hhmm,
  MODERATION_REQUIRES_JAAS,
  virtualApi,
  type Attendee,
  type JitsiApi,
  type JoinInfo,
  type ParticipantStatus,
  type RoomState,
  type SessionCommand,
  type VirtualHearing,
} from '@/lib/virtual-api';
import { JitsiRoom } from '@/pages/virtual/JitsiRoom';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const BASE = '/admin/virtual-courtroom';

const STATUS: Record<
  ParticipantStatus,
  { variant: 'decided' | 'pending' | 'hearing' | 'rejected'; label: string }
> = {
  JOINED: { variant: 'decided', label: msg('Joined') },
  MUTED: { variant: 'pending', label: msg('Muted') },
  VIDEO_OFF: { variant: 'hearing', label: msg('Video off') },
  EJECTED: { variant: 'rejected', label: msg('In lobby') },
};

const ROOM_STATE: Record<RoomState, { variant: 'decided' | 'pending' | 'neutral'; label: string }> =
  {
    OPEN: { variant: 'decided', label: msg('Room open') },
    LOCKED: { variant: 'pending', label: msg('Lobby locked') },
    NOT_YET: { variant: 'pending', label: msg('Opens soon') },
    CLOSED: { variant: 'neutral', label: msg('Closed') },
  };

const ROLE_LABEL: Record<Attendee['role'], string> = {
  JUDGE: msg('Judge'),
  LAWYER: msg('Counsel'),
  LITIGANT: msg('Litigant'),
  OBSERVER: msg('Observer'),
  ADMIN: msg('Admin Bench'),
};

function FallbackBanner() {
  const { t } = useTranslation();
  return (
    <Alert variant="info" title={t('Running on public Jitsi (fallback mode)')} className="mb-4">
      {t(
        '{{MODERATION_REQUIRES_JAAS}} Rooms use an unguessable name on meet.jit.si; public Jitsi limits embedded meetings, so use JaaS for real hearings.',
        { MODERATION_REQUIRES_JAAS: t(MODERATION_REQUIRES_JAAS) },
      )}
    </Alert>
  );
}

function HearingCell({ h }: { h: VirtualHearing }) {
  return (
    <>
      <span className="case-number block font-medium text-primary">{h.ucn}</span>
      <span className="block">{h.title}</span>
    </>
  );
}

const when = (h: VirtualHearing) => `${isoToDdMmYyyy(h.date)} ${h.startTime}–${h.endTime}`;

/** "Virtual Courtroom Control": active sessions, today's virtual hearings to open, recently ended sessions. */
export function VirtualCourtroomListPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'virtual-sessions'],
    queryFn: virtualApi.sessions,
    refetchInterval: 10_000,
  });
  const init = useMutation({
    mutationFn: (hearingId: string) => virtualApi.initialize(hearingId),
    onSuccess: async (r) => {
      toast.success(r.message);
      await qc.invalidateQueries({ queryKey: ['admin', 'virtual-sessions'] });
      void navigate(`${BASE}/${r.sessionId}`);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <>
      <PageHeader
        title={t('Virtual Courtroom Control')}
        description={t(
          'Open virtual hearing sessions, monitor connections and manage room participants.',
        )}
        crumbs={[
          { label: t('Dashboard'), to: '/admin' },
          { label: t('Virtual Courtroom Control') },
        ]}
      />
      {data && !data.moderationEnabled && <FallbackBanner />}
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <TableSkeleton rows={4} cols={5} />
      ) : (
        data && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="size-5 text-primary" aria-hidden="true" />{' '}
                  {t('Active sessions')}
                </CardTitle>
              </CardHeader>
              {data.active.length === 0 ? (
                <EmptyState icon={Video} title={t('No virtual courtroom session is active.')} />
              ) : (
                <div className="p-5 pt-0">
                  <Table aria-label={t('Active sessions')}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Case')}</TableHead>
                        <TableHead>{t('Hearing')}</TableHead>
                        <TableHead>{t('Bench')}</TableHead>
                        <TableHead>{t('Attendees')}</TableHead>
                        <TableHead>
                          <span className="sr-only">{t('Actions')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.active.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="min-w-48">
                            <HearingCell h={s.hearing} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-sm">
                            {when(s.hearing)}
                          </TableCell>
                          <TableCell>
                            {s.hearing.judge}
                            <span className="block text-sm text-text-muted">
                              {s.hearing.courtroom}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.liveCount > 0 ? 'decided' : 'neutral'}>
                              {t('{{liveCount}} live', { liveCount: s.liveCount })}
                            </Badge>
                            <span className="block text-sm text-text-muted">
                              {t('{{participantCount}} joined so far', {
                                participantCount: s.participantCount,
                              })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" asChild>
                              <Link to={`${BASE}/${s.id}`}>{t('Open control workspace')}</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Today's virtual hearings awaiting a session")}</CardTitle>
              </CardHeader>
              {data.awaiting.length === 0 ? (
                <EmptyState
                  icon={DoorOpen}
                  title={t('Every virtual hearing for today has a session.')}
                  description={t('Flag a hearing as virtual from the Bench Scheduling board.')}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {data.awaiting.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <span>
                        <span className="font-mono text-sm">{when(h)}</span> <HearingCell h={h} />
                        <span className="block text-sm text-text-muted">
                          {h.courtroom} · {h.judge}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        loading={init.isPending && init.variables === h.id}
                        onClick={() => init.mutate(h.id)}
                      >
                        <Video aria-hidden="true" /> {t('Initialize Virtual Courtroom Session')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {data.recent.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('Recently ended')}</CardTitle>
                </CardHeader>
                <ul className="divide-y divide-border">
                  {data.recent.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <span>
                        <HearingCell h={s.hearing} />
                        <span className="block text-sm text-text-muted">
                          {t('Ended {{dateTime}}', { dateTime: formatDateTime(s.endedAt) })}
                        </span>
                      </span>
                      <Link to={`${BASE}/${s.id}`} className="text-sm font-semibold">
                        {t('View attendees')}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )
      )}
    </>
  );
}

function AttendeeRow({
  a,
  sessionId,
  canModerate,
  onDone,
}: {
  a: Attendee;
  sessionId: string;
  canModerate: boolean;
  onDone: (command: SessionCommand, a: Attendee) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: (command: SessionCommand) => virtualApi.command(sessionId, a.id, command),
    onSuccess: async (r, command) => {
      toast.success(r.message);
      onDone(command, r.participant);
      await qc.invalidateQueries({ queryKey: ['admin', 'virtual-session', sessionId] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  const protectedRole = a.role === 'JUDGE' || a.role === 'ADMIN';
  const s = STATUS[a.status];
  const busy = (c: SessionCommand) => run.isPending && run.variables === c;
  const disabled = !canModerate || protectedRole || run.isPending;
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{a.name}</p>
          <p className="text-sm text-text-muted">{t(ROLE_LABEL[a.role])}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={s.variant}>{t(s.label)}</Badge>
          {a.live ? (
            <Badge variant="decided">{t('Live')}</Badge>
          ) : (
            <span className="text-xs text-text-muted">
              {a.leftAt
                ? t('Left {{hhmm}}', { hhmm: hhmm(a.leftAt) })
                : a.lastSeenAt
                  ? t('Last seen {{hhmm}}', { hhmm: hhmm(a.lastSeenAt) })
                  : t('Connecting')}
            </span>
          )}
        </div>
      </div>
      {a.confirmation && a.lastCommandAt && (
        <Badge variant="accent">
          {a.confirmation} · {hhmm(a.lastCommandAt)}
        </Badge>
      )}
      {!protectedRole && (
        <div className="flex flex-wrap gap-1.5">
          {a.status === 'EJECTED' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              loading={busy('READMIT')}
              onClick={() => run.mutate('READMIT')}
            >
              <UserCheck aria-hidden="true" /> {t('Readmit')}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || a.audioMuted}
                loading={busy('MUTE_AUDIO')}
                onClick={() => run.mutate('MUTE_AUDIO')}
                aria-label={t('Mute Audio Input for {{name}}', { name: a.name })}
              >
                <MicOff aria-hidden="true" /> {t('Mute Audio Input')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || a.videoOff}
                loading={busy('DISABLE_VIDEO')}
                onClick={() => run.mutate('DISABLE_VIDEO')}
                aria-label={t('Disable Video Broadcast for {{name}}', { name: a.name })}
              >
                <VideoOff aria-hidden="true" /> {t('Disable Video Broadcast')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={disabled}
                loading={busy('EJECT')}
                onClick={() => run.mutate('EJECT')}
                aria-label={t('Eject {{name}} to the lobby', { name: a.name })}
              >
                <DoorOpen aria-hidden="true" /> {t('Eject Participant to Lobby')}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** UC-4.1 control workspace and UC-4.2 Manage Room Participants. */
export function VirtualCourtroomControlPage() {
  const { t } = useTranslation();
  const { sessionId = '' } = useParams();
  const qc = useQueryClient();
  const api = useRef<JitsiApi | null>(null);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'connected' | 'left'>(
    'idle',
  );
  const [confirmEnd, setConfirmEnd] = useState(false);

  const { data, isPending, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'virtual-session', sessionId],
    queryFn: () => virtualApi.session(sessionId),
    refetchInterval: 5_000,
  });

  const connect = useMutation({
    mutationFn: () => virtualApi.join(data!.hearing.id),
    onSuccess: (r) => {
      setConnection('connecting');
      setJoin(r);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  const end = useMutation({
    mutationFn: () => virtualApi.end(sessionId),
    onSuccess: async (r) => {
      toast.success(r.message);
      setConfirmEnd(false);
      api.current?.executeCommand('hangup');
      setJoin(null);
      setConnection('idle');
      await qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => {
      setConfirmEnd(false);
      toast.error(parseApiError(e).message);
    },
  });

  const onApi = useCallback((a: JitsiApi | null) => {
    api.current = a;
  }, []);

  /** Applies the recorded command in the room where the IFrame API supports it for a moderator. */
  const applyInRoom = useCallback((command: SessionCommand, a: Attendee) => {
    if (command === 'EJECT' && a.providerParticipantId && api.current) {
      api.current.executeCommand('kickParticipant', a.providerParticipantId);
    }
  }, []);

  if (isPending) return <Skeleton className="h-96" />;
  if (isError || !data) {
    return <Alert variant="error">{parseApiError(error).message}</Alert>;
  }
  const h = data.hearing;
  const active = data.status === 'ACTIVE';
  const canModerate = active && data.moderationEnabled;
  const room = ROOM_STATE[data.room.state];
  const others = data.attendees;

  return (
    <>
      <PageHeader
        title={t('Virtual Courtroom Control')}
        description={`${h.ucn} · ${h.title}`}
        crumbs={[
          { label: t('Dashboard'), to: '/admin' },
          { label: t('Virtual Courtroom Control'), to: BASE },
          { label: h.ucn },
        ]}
        actions={
          active ? (
            <Button variant="destructive" onClick={() => setConfirmEnd(true)}>
              <PhoneOff aria-hidden="true" /> {t('Mark session ended')}
            </Button>
          ) : undefined
        }
      />
      {!data.moderationEnabled && <FallbackBanner />}
      {!active && (
        <Alert variant="info" className="mb-4" title={t('Session ended')}>
          {t('This session was marked as ended on {{dateTime}}.', {
            dateTime: formatDateTime(data.endedAt),
          })}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-text-muted">{t('Room')}</p>
                <Badge variant={room.variant}>{t(room.label)}</Badge>
              </div>
              <div>
                <p className="text-text-muted">{t('Provider')}</p>
                <p className="font-semibold">
                  {data.mode === 'JAAS'
                    ? t('JaaS (8x8.vc), signed tokens')
                    : t('Public meet.jit.si')}
                </p>
              </div>
              <div>
                <p className="text-text-muted">{t('Live attendees')}</p>
                <p className="font-semibold">
                  {t('{{liveCount}} of {{length}}', {
                    liveCount: data.liveCount,
                    length: data.attendees.length,
                  })}
                </p>
              </div>
              <div>
                <p className="text-text-muted">{t('Your connection')}</p>
                <p className="font-semibold">
                  {connection === 'connected'
                    ? t('Connected')
                    : connection === 'connecting'
                      ? t('Connecting…')
                      : t('Not connected')}
                </p>
              </div>
              <div>
                <p className="text-text-muted">{t('Hearing')}</p>
                <p className="font-mono">{when(h)}</p>
              </div>
              <div>
                <p className="text-text-muted">{t('Bench')}</p>
                <p>
                  {h.judge}, {h.courtroom}
                </p>
              </div>
              <div>
                <p className="text-text-muted">{t('Initialized')}</p>
                <p>
                  {t('{{dateTime}} by {{initializedBy}}', {
                    dateTime: formatDateTime(data.startedAt),
                    initializedBy: data.initializedBy,
                  })}
                </p>
              </div>
              <div>
                <p className="text-text-muted">{t('Last refreshed')}</p>
                <p className="font-mono">{hhmm(new Date(dataUpdatedAt).toISOString())}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            {join ? (
              <div className="h-[60dvh] min-h-[420px]">
                <JitsiRoom
                  join={join}
                  onApi={onApi}
                  onJoined={() => setConnection('connected')}
                  onLeft={() => {
                    setConnection('left');
                    setJoin(null);
                  }}
                />
              </div>
            ) : (
              <EmptyState
                icon={Video}
                title={
                  data.room.state === 'OPEN'
                    ? t('Connect to watch and moderate the hearing.')
                    : data.room.message
                }
                action={
                  data.room.state === 'OPEN' ? (
                    <Button loading={connect.isPending} onClick={() => connect.mutate()}>
                      <Video aria-hidden="true" /> {t('Connect to the room')}
                    </Button>
                  ) : undefined
                }
              />
            )}
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle as="h2">{t('Attendees')}</CardTitle>
            <p className="text-sm text-text-muted">{t('Updates every 5 seconds.')}</p>
          </CardHeader>
          {others.length === 0 ? (
            <EmptyState icon={UserCheck} title={t('Nobody has joined yet.')} />
          ) : (
            <ul className="divide-y divide-border" aria-live="polite">
              {others.map((a) => (
                <AttendeeRow
                  key={a.id}
                  a={a}
                  sessionId={sessionId}
                  canModerate={canModerate}
                  onDone={applyInRoom}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Link to={BASE} className="mt-6 inline-flex items-center gap-1 font-semibold">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" /> {t('All sessions')}
      </Link>

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title={t('Mark session ended')}
        description={t(
          'Everyone still in the room will be told the hearing session has ended, and the join links close.',
        )}
        confirmLabel={t('Mark session ended')}
        destructive
        loading={end.isPending}
        onConfirm={() => end.mutate()}
      />
    </>
  );
}
