import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PK_TZ } from './common/pk-time';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);
  // Slots and the virtual courtroom window use Pakistan time explicitly (common/pk-time.ts). TZ=Asia/Karachi
  // (checked after ConfigModule has loaded .env) keeps library local-time formatting in Pakistan time too.
  if (process.env.TZ !== PK_TZ) {
    new Logger('Bootstrap').warn(
      `TZ is not ${PK_TZ}. Set TZ=${PK_TZ} (see docs/DEPLOYMENT.md); hearing times are still evaluated in Pakistan time.`,
    );
  }

  const config = app.get(ConfigService);
  const cookieName = config.getOrThrow<string>('COOKIE_NAME');

  const swagger = new DocumentBuilder()
    .setTitle('DigitalAdaalat API')
    .setDescription('Judicial ERP for the courts of Pakistan. Phase 1: authentication and users.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth(cookieName)
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  new Logger('Bootstrap').log(`API running on http://localhost:${port}/api  (docs: /api/docs)`);
}

void bootstrap();
