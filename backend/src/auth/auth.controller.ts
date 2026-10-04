import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { parseDurationMs } from '../common/utils/duration';
import { AuthService, RequestMeta } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { RegisterDto } from './dto/register.dto';

/** Credential endpoints: 30 requests per minute per client (override with AUTH_THROTTLE_LIMIT). */
const authThrottle = () => ({
  default: { limit: () => Number(process.env.AUTH_THROTTLE_LIMIT ?? 30), ttl: () => 60_000 },
});

/** Forgot-password stays stricter because it triggers an email: 10 per minute (FORGOT_THROTTLE_LIMIT). */
const forgotThrottle = () => ({
  default: { limit: () => Number(process.env.FORGOT_THROTTLE_LIMIT ?? 10), ttl: () => 60_000 },
});

const meta = (req: Request): RequestMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/',
    };
  }

  /** Public self-registration for LITIGANT and LAWYER accounts. */
  @Public()
  @Throttle(authThrottle())
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, meta(req));
  }

  /**
   * Logs in with email (or admin username) and password. Sets an httpOnly cookie.
   * Mobile clients send `X-Client: mobile` to also receive the token in the response body for Bearer use.
   */
  @Public()
  @Throttle(authThrottle())
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-Client',
    required: false,
    description: 'Send "mobile" to receive accessToken in the body',
  })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { message, user, token } = await this.auth.login(dto, meta(req));
    const maxAge = parseDurationMs(this.config.getOrThrow<string>('JWT_EXPIRES_IN'));
    res.cookie(this.config.getOrThrow<string>('COOKIE_NAME'), token, {
      ...this.cookieOptions(),
      maxAge,
    });
    const wantsToken = String(req.headers['x-client'] ?? '').toLowerCase() === 'mobile';
    return { message, user, ...(wantsToken ? { accessToken: token } : {}) };
  }

  /** Clears the auth cookie. Works with or without a valid session. */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieName = this.config.getOrThrow<string>('COOKIE_NAME');
    res.clearCookie(cookieName, this.cookieOptions());

    let actor: { sub?: string; role?: AuthUser['role'] } = {};
    const token =
      (req.cookies?.[cookieName] as string | undefined) ??
      req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        actor = await this.jwt.verifyAsync(token);
      } catch {
        // expired or invalid token: still log out, just without an actor
      }
    }
    return this.auth.logout(actor.sub, actor.role, meta(req));
  }

  /** Always answers with the same message so registered emails cannot be discovered. */
  @Public()
  @Throttle(forgotThrottle())
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(dto, meta(req));
  }

  @Public()
  @Throttle(authThrottle())
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, meta(req));
  }

  /** The currently logged-in user. */
  @ApiCookieAuth()
  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
