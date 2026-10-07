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

const BASE = '/admin/virtual-courtroom';

const STATUS: Record<
  ParticipantStatus,
  { variant: 'decided' | 'pending' | 'hearing' | 'rejected'; label: string }
> = {
  JOINED: { variant: 'decided', label: 'Joined' },
  MUTED: { variant: 'pending', label: 'Muted' },
  VIDEO_OFF: { variant: 'hearing', label: 'Video off' },
  EJECTED: { variant: 'rejected', label: 'In lobby' },
};

const ROOM_STATE: Record<RoomState, { variant: 'decided' | 'pending' | 'neutral'; label: string }> =
  {
    OPEN: { variant: 'decided', label: 'Room open' },
    LOCKED: { variant: 'pending', label: 'Lobby locked' },
    NOT_YET: { variant: 'pending', label: 'Opens soon' },
    CLOSED: { variant: 'neutral', label: 'Closed' },
  };

const ROLE_LABEL: Record<Attendee['role'], string> = {
  JUDGE: 'Judge',
  LAWYER: 'Counsel',
  LITIGANT: 'Litigant',
  OBSERVER: 'Observer',
  ADMIN: 'Admin Bench',
};

function FallbackBanner() {
  return (
    <Alert variant="info" title="Running on public Jitsi (fallback mode)" className="mb-4">
      {MODERATION_REQUIRES_JAAS} Rooms use an unguessable name on meet.jit.si; public Jitsi limits
      embedded meetings, so use JaaS for real hearings.
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
        title="Virtual Courtroom Control"
        description="Open virtual hearing sessions, monitor connections and manage room participants."
        crumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Virtual Courtroom Control' }]}
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
                  <Radio className="size-5 text-primary" aria-hidden="true" /> Active sessions
                </CardTitle>
              </CardHeader>
              {data.active.length === 0 ? (
                <EmptyState icon={Video} title="No virtual courtroom session is active." />
              ) : (
                <div className="p-5 pt-0">
                  <Table aria-label="Active sessions">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Case</TableHead>
                        <TableHead>Hearing</TableHead>
                        <TableHead>Bench</TableHead>
                        <TableHead>Attendees</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
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
                              {s.liveCount} live
                            </Badge>
                            <span className="block text-sm text-text-muted">
                              {s.participantCount} joined so far
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" asChild>
                              <Link to={`${BASE}/${s.id}`}>Open control workspace</Link>
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
                <CardTitle>Today's virtual hearings awaiting a session</CardTitle>
              </CardHeader>
              {data.awaiting.length === 0 ? (
                <EmptyState
                  icon={DoorOpen}
                  title="Every virtual hearing for today has a session."
                  description="Flag a hearing as virtual from the Bench Scheduling board."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {data.awaiting.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <span>
                        <span className="font-mono text-sm">{when(h)}</span>{' '}
                        <HearingCell h={h} />
                        <span className="block text-sm text-text-muted">
                          {h.courtroom} · {h.judge}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        loading={init.isPending && init.variables === h.id}
                        onClick={() => init.mutate(h.id)}
                      >
                        <Video aria-hidden="true" /> Initialize Virtual Courtroom Session
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {data.recent.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Recently ended</CardTitle>
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
                          Ended {formatDateTime(s.endedAt)}
                        </span>
                      </span>
                      <Link to={`${BASE}/${s.id}`} className="text-sm font-semibold">
                        View attendees
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
          <p className="text-sm text-text-muted">{ROLE_LABEL[a.role]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={s.variant}>{s.label}</Badge>
          {a.live ? (
            <Badge variant="decided">Live</Badge>
          ) : (
            <span className="text-xs text-text-muted">
              {a.leftAt
                ? `Left ${hhmm(a.leftAt)}`
                : a.lastSeenAt
                  ? `Last seen ${hhmm(a.lastSeenAt)}`
                  : 'Connecting'}
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
              <UserCheck aria-hidden="true" /> Readmit
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || a.audioMuted}
                loading={busy('MUTE_AUDIO')}
                onClick={() => run.mutate('MUTE_AUDIO')}
                aria-label={`Mute Audio Input for ${a.name}`}
              >
                <MicOff aria-hidden="true" /> Mute Audio Input
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || a.videoOff}
                loading={busy('DISABLE_VIDEO')}
                onClick={() => run.mutate('DISABLE_VIDEO')}
                aria-label={`Disable Video Broadcast for ${a.name}`}
              >
                <VideoOff aria-hidden="true" /> Disable Video Broadcast
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={disabled}
                loading={busy('EJECT')}
                onClick={() => run.mutate('EJECT')}
                aria-label={`Eject ${a.name} to the lobby`}
              >
                <DoorOpen aria-hidden="true" /> Eject Participant to Lobby
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
        title="Virtual Courtroom Control"
        description={`${h.ucn} · ${h.title}`}
        crumbs={[
          { label: 'Dashboard', to: '/admin' },
          { label: 'Virtual Courtroom Control', to: BASE },
          { label: h.ucn },
        ]}
        actions={
          active ? (
            <Button variant="destructive" onClick={() => setConfirmEnd(true)}>
              <PhoneOff aria-hidden="true" /> Mark session ended
            </Button>
          ) : undefined
        }
      />
      {!data.moderationEnabled && <FallbackBanner />}
      {!active && (
        <Alert variant="info" className="mb-4" title="Session ended">
          This session was marked as ended on {formatDateTime(data.endedAt)}.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-text-muted">Room</p>
                <Badge variant={room.variant}>{room.label}</Badge>
              </div>
              <div>
                <p className="text-text-muted">Provider</p>
                <p className="font-semibold">
                  {data.mode === 'JAAS' ? 'JaaS (8x8.vc), signed tokens' : 'Public meet.jit.si'}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Live attendees</p>
                <p className="font-semibold">
                  {data.liveCount} of {data.attendees.length}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Your connection</p>
                <p className="font-semibold">
                  {connection === 'connected'
                    ? 'Connected'
                    : connection === 'connecting'
                      ? 'Connecting…'
                      : 'Not connected'}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Hearing</p>
                <p className="font-mono">{when(h)}</p>
              </div>
              <div>
                <p className="text-text-muted">Bench</p>
                <p>
                  {h.judge}, {h.courtroom}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Initialized</p>
                <p>
                  {formatDateTime(data.startedAt)} by {data.initializedBy}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Last refreshed</p>
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
                    ? 'Connect to watch and moderate the hearing.'
                    : data.room.message
                }
                action={
                  data.room.state === 'OPEN' ? (
                    <Button loading={connect.isPending} onClick={() => connect.mutate()}>
                      <Video aria-hidden="true" /> Connect to the room
                    </Button>
                  ) : undefined
                }
              />
            )}
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle as="h2">Attendees</CardTitle>
            <p className="text-sm text-text-muted">Updates every 5 seconds.</p>
          </CardHeader>
          {others.length === 0 ? (
            <EmptyState icon={UserCheck} title="Nobody has joined yet." />
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
        <ArrowLeft className="size-4" aria-hidden="true" /> All sessions
      </Link>

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="Mark session ended"
        description="Everyone still in the room will be told the hearing session has ended, and the join links close."
        confirmLabel="Mark session ended"
        destructive
        loading={end.isPending}
        onConfirm={() => end.mutate()}
      />
    </>
  );
}
