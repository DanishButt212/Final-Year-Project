import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { EvidenceModule } from './evidence/evidence.module';
import { ChamberModule } from './chamber/chamber.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FeesModule } from './fees/fees.module';
import { CasesModule } from './cases/cases.module';
import { StorageModule } from './storage/storage.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JudgeModule } from './judge/judge.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv as never,
    }),
    // 100 requests/minute per client overall; credential endpoints are stricter (see AuthController).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      skipIf: () =>
        process.env.NODE_ENV === 'test' && process.env.ENABLE_THROTTLE_IN_TEST !== 'true',
    }),
    PrismaModule,
    AuditModule,
    IntegrationsModule,
    StorageModule,
    SettingsModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    CasesModule,
    AdminModule,
    JudgeModule,
    SchedulingModule,
    FeesModule,
    EvidenceModule,
    FeedbackModule,
    ChamberModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle first, then authenticate, then authorise by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
