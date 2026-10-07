import { api } from './api';

export type RoomState = 'LOCKED' | 'OPEN' | 'NOT_YET' | 'CLOSED';
export type ProviderKind = 'JAAS' | 'JITSI_PUBLIC';
export type ParticipantStatus = 'JOINED' | 'MUTED' | 'VIDEO_OFF' | 'EJECTED';
export type SessionCommand = 'MUTE_AUDIO' | 'DISABLE_VIDEO' | 'EJECT' | 'READMIT';
export type SessionEvent =
  | 'JOINED'
  | 'LEFT'
  | 'AUDIO_MUTED'
  | 'AUDIO_UNMUTED'
  | 'VIDEO_OFF'
  | 'VIDEO_ON'
  | 'HEARTBEAT';

export const LOBBY_LOCKED_MESSAGE = 'Court Session Lobby is currently locked by the Admin Bench.';
export const MODERATION_REQUIRES_JAAS = 'Moderation controls require the JaaS configuration.';

export interface RoomStatus {
  hearingId: string;
  state: RoomState;
  message: string;
  opensAt: string;
  closesAt: string;
  sessionId: string | null;
}

export interface VirtualHearing {
  id: string;
  caseId: string;
  ucn: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  courtroom: string | null;
  judge: string;
  opensAt: string;
  closesAt: string;
}

export interface JoinInfo {
  provider: ProviderKind;
  domain: string;
  roomName: string;
  scriptUrl: string;
  jwt?: string;
  sessionId: string;
  participantId: string;
  displayName: string;
  isModerator: boolean;
  moderationEnabled: boolean;
  hearing: VirtualHearing;
}

export interface Attendee {
  id: string;
  userId: string;
  name: string;
  role: 'JUDGE' | 'LAWYER' | 'LITIGANT' | 'OBSERVER' | 'ADMIN';
  status: ParticipantStatus;
  audioMuted: boolean;
  videoOff: boolean;
  providerParticipantId: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  lastSeenAt: string | null;
  live: boolean;
  lastCommand: SessionCommand | null;
  lastCommandAt: string | null;
  confirmation: string | null;
}

export interface SessionDetail {
  id: string;
  status: 'LOBBY_LOCKED' | 'ACTIVE' | 'ENDED';
  provider: string;
  mode: ProviderKind;
  moderationEnabled: boolean;
  startedAt: string | null;
  endedAt: string | null;
  initializedBy: string;
  hearing: VirtualHearing;
  room: { state: RoomState; message: string };
  attendees: Attendee[];
  liveCount: number;
  serverTime: string;
}

export interface SessionList {
  mode: ProviderKind;
  moderationEnabled: boolean;
  active: {
    id: string;
    status: string;
    startedAt: string | null;
    hearing: VirtualHearing;
    liveCount: number;
    participantCount: number;
  }[];
  awaiting: VirtualHearing[];
  recent: {
    id: string;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    hearing: VirtualHearing;
  }[];
}

export interface MyParticipation {
  sessionStatus: 'LOBBY_LOCKED' | 'ACTIVE' | 'ENDED';
  status: ParticipantStatus;
  audioMuted: boolean;
  videoOff: boolean;
  lastCommand: SessionCommand | null;
  lastCommandAt: string | null;
  message: string | null;
}

export const virtualApi = {
  async initialize(hearingId: string) {
    return (
      await api.post<{ message: string; sessionId: string }>(
        `/admin/hearings/${hearingId}/virtual-session/initialize`,
      )
    ).data;
  },
  async sessions() {
    return (await api.get<SessionList>('/admin/virtual-sessions')).data;
  },
  async session(id: string) {
    return (await api.get<SessionDetail>(`/admin/virtual-sessions/${id}`)).data;
  },
  async command(id: string, participantId: string, command: SessionCommand) {
    return (
      await api.post<{ message: string; participant: Attendee }>(
        `/admin/virtual-sessions/${id}/command`,
        { participantId, command },
      )
    ).data;
  },
  async end(id: string) {
    return (await api.post<{ message: string }>(`/admin/virtual-sessions/${id}/end`)).data;
  },
  async status(hearingId: string) {
    return (await api.get<RoomStatus>(`/hearings/${hearingId}/virtual-session/status`)).data;
  },
  async join(hearingId: string) {
    return (await api.post<JoinInfo>(`/hearings/${hearingId}/virtual-session/join`)).data;
  },
  async event(sessionId: string, type: SessionEvent, providerParticipantId?: string) {
    await api.post(`/sessions/${sessionId}/events`, { type, providerParticipantId });
  },
  async me(sessionId: string) {
    return (await api.get<MyParticipation>(`/sessions/${sessionId}/me`)).data;
  },
};

// ---------------------------------------------------------------- Jitsi IFrame API (loaded on demand)

/** The subset of JitsiMeetExternalAPI used here. */
export interface JitsiApi {
  addListener(event: string, listener: (payload: Record<string, unknown>) => void): void;
  executeCommand(command: string, ...args: unknown[]): void;
  isAudioMuted(): Promise<boolean>;
  isVideoMuted(): Promise<boolean>;
  dispose(): void;
}

type JitsiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

const loaded = new Map<string, Promise<JitsiCtor>>();

/** Loads external_api.js from the provider's own domain once per URL. */
export function loadJitsi(scriptUrl: string): Promise<JitsiCtor> {
  const cached = loaded.get(scriptUrl);
  if (cached) return cached;
  const promise = new Promise<JitsiCtor>((resolve, reject) => {
    const w = window as unknown as { JitsiMeetExternalAPI?: JitsiCtor };
    if (w.JitsiMeetExternalAPI) {
      resolve(w.JitsiMeetExternalAPI);
      return;
    }
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () =>
      w.JitsiMeetExternalAPI
        ? resolve(w.JitsiMeetExternalAPI)
        : reject(new Error('The video service did not load.'));
    script.onerror = () => {
      loaded.delete(scriptUrl);
      reject(new Error('The video service could not be reached.'));
    };
    document.head.appendChild(script);
  });
  loaded.set(scriptUrl, promise);
  return promise;
}

/** HH:mm in local time. */
export function hhmm(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
