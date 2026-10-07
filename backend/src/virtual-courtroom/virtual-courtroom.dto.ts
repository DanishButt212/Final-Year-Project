import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { TrimOrUndefined } from '../common/validators';

export const SESSION_COMMANDS = ['MUTE_AUDIO', 'DISABLE_VIDEO', 'EJECT', 'READMIT'] as const;
export type SessionCommandName = (typeof SESSION_COMMANDS)[number];

export class SessionCommandDto {
  @IsUUID()
  participantId: string;

  @IsIn(SESSION_COMMANDS, {
    message: 'Command must be MUTE_AUDIO, DISABLE_VIDEO, EJECT or READMIT.',
  })
  command: SessionCommandName;
}

export const SESSION_EVENTS = [
  'JOINED',
  'LEFT',
  'AUDIO_MUTED',
  'AUDIO_UNMUTED',
  'VIDEO_OFF',
  'VIDEO_ON',
  'HEARTBEAT',
] as const;
export type SessionEventName = (typeof SESSION_EVENTS)[number];

export class SessionEventDto {
  @IsIn(SESSION_EVENTS, {
    message:
      'Event must be JOINED, LEFT, AUDIO_MUTED, AUDIO_UNMUTED, VIDEO_OFF, VIDEO_ON or HEARTBEAT.',
  })
  type: SessionEventName;

  /** The Jitsi participant id of this client (sent with JOINED), used by the admin's kick command. */
  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Invalid participant id.' })
  providerParticipantId?: string;
}
