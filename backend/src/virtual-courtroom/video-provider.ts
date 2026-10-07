import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createSign, KeyObject } from 'node:crypto';

export type ProviderKind = 'JAAS' | 'JITSI_PUBLIC';

export interface RoomCredentials {
  provider: ProviderKind;
  /** Host of the Jitsi deployment, used by the IFrame API. */
  domain: string;
  /** Room name to pass to the IFrame API (JaaS rooms are prefixed with the app id). */
  roomName: string;
  /** external_api.js served by the provider domain. */
  scriptUrl: string;
  jwt?: string;
}

export interface RoomUser {
  id: string;
  name: string;
  email: string;
  moderator: boolean;
}

/** Small seam so another conferencing service can replace Jitsi later. */
export interface VideoProvider {
  readonly kind: ProviderKind;
  /** True only when the provider enforces moderator rights (mute, kick) for the admin and the judge. */
  readonly moderationEnabled: boolean;
  credentials(roomName: string, user: RoomUser): RoomCredentials;
}

const TOKEN_TTL_SECONDS = 10 * 60;

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/**
 * Jitsi in two modes, chosen at startup:
 *  - JaaS (8x8.vc) when JAAS_APP_ID, JAAS_KID and JAAS_PRIVATE_KEY are set: a short-lived RS256 token per user,
 *    scoped to the room, moderator only for the admin and the case's judge;
 *  - otherwise public meet.jit.si with the unguessable room name and no token (moderation not enforceable).
 * The private key is never logged.
 */
@Injectable()
export class JitsiVideoProvider implements VideoProvider {
  private readonly logger = new Logger('VirtualCourtroom');
  readonly kind: ProviderKind;
  readonly moderationEnabled: boolean;
  private readonly appId?: string;
  private readonly kid?: string;
  private readonly key?: KeyObject;

  constructor(config: ConfigService) {
    const appId = config.get<string>('JAAS_APP_ID');
    const kid = config.get<string>('JAAS_KID');
    const rawKey = config.get<string>('JAAS_PRIVATE_KEY');
    let key: KeyObject | undefined;
    if (appId && kid && rawKey && !rawKey.startsWith('CHANGE_ME')) {
      try {
        key = createPrivateKey(Buffer.from(rawKey, 'base64').toString('utf8'));
      } catch {
        this.logger.warn('JAAS_PRIVATE_KEY could not be read; using the public Jitsi fallback.');
      }
    } else if (appId || kid || rawKey) {
      this.logger.warn('JaaS is only partly configured; using the public Jitsi fallback.');
    }
    if (key && appId && kid) {
      this.kind = 'JAAS';
      this.moderationEnabled = true;
      this.appId = appId;
      this.kid = kid;
      this.key = key;
    } else {
      this.kind = 'JITSI_PUBLIC';
      this.moderationEnabled = false;
    }
  }

  credentials(roomName: string, user: RoomUser): RoomCredentials {
    if (this.kind === 'JITSI_PUBLIC') {
      return {
        provider: this.kind,
        domain: 'meet.jit.si',
        roomName,
        scriptUrl: 'https://meet.jit.si/external_api.js',
      };
    }
    return {
      provider: this.kind,
      domain: '8x8.vc',
      roomName: `${this.appId}/${roomName}`,
      scriptUrl: `https://8x8.vc/${this.appId}/external_api.js`,
      jwt: this.sign(roomName, user),
    };
  }

  private sign(roomName: string, user: RoomUser): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', kid: this.kid, typ: 'JWT' };
    const payload = {
      aud: 'jitsi',
      iss: 'chat',
      sub: this.appId,
      room: roomName,
      iat: now,
      nbf: now - 10,
      exp: now + TOKEN_TTL_SECONDS,
      context: {
        user: { id: user.id, name: user.name, email: user.email, moderator: user.moderator },
        features: {
          livestreaming: false,
          recording: false,
          transcription: false,
          'outbound-call': false,
          'sip-outbound-call': false,
        },
      },
    };
    const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.key as KeyObject);
    return `${unsigned}.${b64url(signature)}`;
  }
}

export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
