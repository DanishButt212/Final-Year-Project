import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { loadJitsi, virtualApi, type JitsiApi, type JoinInfo } from '@/lib/virtual-api';

const HEARTBEAT_MS = 15_000;

/**
 * The embedded Jitsi room (IFrame API, external_api.js from the provider's domain). Reports join, leave, mute and
 * heartbeat events to the API so the admin's attendee list stays current.
 */
export function JitsiRoom({
  join,
  onApi,
  onJoined,
  onLeft,
  className,
}: {
  join: JoinInfo;
  onApi?: (api: JitsiApi | null) => void;
  onJoined?: () => void;
  onLeft?: () => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onApi, onJoined, onLeft });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callbacks.current = { onApi, onJoined, onLeft };
  });

  useEffect(() => {
    let disposed = false;
    let api: JitsiApi | null = null;
    let joined = false;
    let heartbeat: number | undefined;
    const report = (type: Parameters<typeof virtualApi.event>[1], id?: string) =>
      virtualApi.event(join.sessionId, type, id).catch(() => undefined);

    loadJitsi(join.scriptUrl)
      .then((JitsiMeetExternalAPI) => {
        if (disposed || !container.current) return;
        api = new JitsiMeetExternalAPI(join.domain, {
          roomName: join.roomName,
          parentNode: container.current,
          width: '100%',
          height: '100%',
          ...(join.jwt ? { jwt: join.jwt } : {}),
          userInfo: { displayName: join.displayName },
          configOverwrite: {
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            subject: `${join.hearing.ucn} · Virtual hearing`,
          },
          interfaceConfigOverwrite: { SHOW_CHROME_EXTENSION_BANNER: false },
        });
        const a = api;
        a.addListener('videoConferenceJoined', (p) => {
          joined = true;
          void report('JOINED', typeof p.id === 'string' ? p.id : undefined).then(async () => {
            if (await a.isAudioMuted()) await report('AUDIO_MUTED');
            if (await a.isVideoMuted()) await report('VIDEO_OFF');
          });
          heartbeat = window.setInterval(() => void report('HEARTBEAT'), HEARTBEAT_MS);
          callbacks.current.onJoined?.();
        });
        a.addListener('audioMuteStatusChanged', (p) => {
          if (joined) void report(p.muted ? 'AUDIO_MUTED' : 'AUDIO_UNMUTED');
        });
        a.addListener('videoMuteStatusChanged', (p) => {
          if (joined) void report(p.muted ? 'VIDEO_OFF' : 'VIDEO_ON');
        });
        const left = () => {
          if (!joined) return;
          joined = false;
          window.clearInterval(heartbeat);
          void report('LEFT');
          callbacks.current.onLeft?.();
        };
        a.addListener('videoConferenceLeft', left);
        a.addListener('readyToClose', left);
        callbacks.current.onApi?.(a);
      })
      .catch((e: Error) => !disposed && setError(e.message));

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      if (joined) void report('LEFT');
      callbacks.current.onApi?.(null);
      api?.dispose();
    };
  }, [join]);

  if (error) {
    return (
      <Alert variant="error" title="Video room unavailable">
        {error} Check your connection and try again.
      </Alert>
    );
  }
  return (
    <div
      ref={container}
      className={className ?? 'h-full min-h-[420px] w-full overflow-hidden rounded-md bg-black'}
      aria-label="Video conference room"
    />
  );
}
