import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { ScalesIcon } from '@/components/layout/Logo';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api';
import { PORTALS, portalPath } from '@/lib/navigation';
import { isoToDdMmYyyy } from '@/lib/scheduling-api';
import { virtualApi, type JitsiApi } from '@/lib/virtual-api';
import { JitsiRoom } from './JitsiRoom';

/** Full-page conferencing room for the case's parties and judge (UC-3.3). */
export default function RoomPage() {
  const { hearingId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const api = useRef<JitsiApi | null>(null);
  const mountedAt = useRef(0);
  const applied = useRef(0);
  const [left, setLeft] = useState<string | null>(null);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const back =
    user?.role === 'JUDGE'
      ? '/judge/schedule'
      : user
        ? portalPath(PORTALS[user.role], 'hearings')
        : '/';

  const join = useQuery({
    queryKey: ['virtual-join', hearingId],
    queryFn: () => virtualApi.join(hearingId),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const sessionId = join.data?.sessionId;

  // The Admin Bench's commands and the end of the session reach this client through its own participant row.
  const me = useQuery({
    queryKey: ['virtual-me', sessionId],
    queryFn: () => virtualApi.me(sessionId!),
    enabled: Boolean(sessionId) && !left,
    refetchInterval: (q) =>
      q.state.data?.status === 'EJECTED' || q.state.data?.sessionStatus === 'ENDED' ? false : 5_000,
  });
  const removed =
    me.data && (me.data.status === 'EJECTED' || me.data.sessionStatus === 'ENDED')
      ? (me.data.message ?? 'This virtual hearing session has ended.')
      : null;
  const closed = left ?? removed;
  useEffect(() => {
    const m = me.data;
    if (!m || m.status === 'EJECTED' || m.sessionStatus === 'ENDED') return;
    const at = m.lastCommandAt ? new Date(m.lastCommandAt).getTime() : 0;
    const a = api.current;
    if (!a || at <= mountedAt.current || at <= applied.current) return;
    applied.current = at;
    void (async () => {
      if (m.lastCommand === 'MUTE_AUDIO' && !(await a.isAudioMuted())) a.executeCommand('toggleAudio');
      if (m.lastCommand === 'DISABLE_VIDEO' && !(await a.isVideoMuted())) {
        a.executeCommand('toggleVideo');
      }
    })();
  }, [me.data]);

  const onApi = useCallback((a: JitsiApi | null) => {
    api.current = a;
  }, []);
  const leave = useCallback(() => {
    api.current?.executeCommand('hangup');
    void navigate(back);
  }, [navigate, back]);

  const h = join.data?.hearing;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-primary px-4 py-3 text-on-primary">
        <div className="flex min-w-0 items-center gap-3">
          <ScalesIcon className="size-7 shrink-0" />
          <div className="min-w-0">
            <p className="font-heading text-lg font-bold leading-tight">Virtual Courtroom</p>
            {h && (
              <p className="truncate text-sm opacity-90">
                <span className="case-number">{h.ucn}</span> · {h.title} ·{' '}
                {isoToDdMmYyyy(h.date)} {h.startTime}–{h.endTime} · {h.judge}
              </p>
            )}
          </div>
        </div>
        <Button variant="secondary" onClick={leave}>
          <LogOut aria-hidden="true" /> Leave
        </Button>
      </header>
      <main className="flex flex-1 flex-col p-3 sm:p-4">
        {join.isPending ? (
          <Skeleton className="flex-1" />
        ) : join.isError ? (
          <div className="mx-auto mt-10 w-full max-w-xl space-y-4">
            <Alert variant="error" title="You cannot enter the video room">
              {parseApiError(join.error).message}
            </Alert>
            <Link to={back} className="inline-flex items-center gap-1 font-semibold">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to the hearing schedule
            </Link>
          </div>
        ) : closed ? (
          <div className="mx-auto mt-10 w-full max-w-xl space-y-4">
            <Alert variant="info" title="You have left the video room">
              {closed}
            </Alert>
            <Link to={back} className="inline-flex items-center gap-1 font-semibold">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to the hearing schedule
            </Link>
          </div>
        ) : (
          join.data && (
            <JitsiRoom
              join={join.data}
              onApi={onApi}
              onLeft={() => setLeft('You left the virtual hearing.')}
              className="min-h-[70dvh] w-full flex-1 overflow-hidden rounded-md bg-black"
            />
          )
        )}
      </main>
    </div>
  );
}
