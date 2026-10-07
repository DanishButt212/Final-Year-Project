import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // The Prisma CLI (migrate deploy, migrate dev) uses DIRECT_URL when set: on Neon that is the direct, non-pooled
  // connection, which migrations need. The running app connects through DATABASE_URL (the pooled URL) instead.
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
