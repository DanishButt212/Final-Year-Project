import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { Role } from '../src/generated/prisma/client';
import { MockMailerService } from '../src/integrations/mock-mailer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export const mailer = { send: jest.fn() };

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MockMailerService)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/**
 * Empties every table. TRUNCATE is used because the AuditLog trigger blocks DELETE;
 * TRUNCATE does not fire row triggers.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export const validRegistration = (overrides: Record<string, unknown> = {}) => ({
  role: 'LITIGANT',
  firstName: 'Ayesha',
  lastName: 'Siddiqui',
  cnic: '36302-1111111-1',
  email: 'ayesha@example.test',
  phone: '+92 300 1111111',
  password: 'Passw0rdTest',
  confirmPassword: 'Passw0rdTest',
  ...overrides,
});

export async function createUser(
  prisma: PrismaService,
  opts: { role: Role; email: string; cnic: string; password: string; username?: string },
) {
  return prisma.user.create({
    data: {
      role: opts.role,
      firstName: 'Test',
      lastName: opts.role,
      cnic: opts.cnic,
      email: opts.email,
      username: opts.username,
      phone: '+92 300 0000000',
      passwordHash: await bcrypt.hash(opts.password, 4),
    },
  });
}

/** A tiny but real PDF: starts with the %PDF- signature. `label` makes each file's bytes (and hash) unique. */
export const pdfBuffer = (label = 'doc'): Buffer =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${label}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );

export const validCase = (overrides: Record<string, unknown> = {}) => ({
  caseType: 'CIVIL_SUIT',
  reliefSought: 'Recovery of PKR 500,000 under the sale agreement dated 01-01-2026.',
  petitioners: [{ name: 'Ayesha Siddiqui', address: 'House 5, Gulgasht, Multan' }],
  respondents: [{ name: 'Bilal Ahmed', cnic: '36302-2222222-2', phone: '+92 321 7654321' }],
  ...overrides,
});
