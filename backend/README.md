# Backend

REST API for DigitalAdaalat. Runs on http://localhost:4000 with the global prefix `/api`; Swagger is at `/api/docs`.

Stack: NestJS 12 + TypeScript, Prisma 7 + PostgreSQL, JWT (httpOnly cookie, Bearer also accepted), bcrypt, class-validator, helmet, `@nestjs/throttler`, Swagger, Jest + Supertest. Exact versions are listed in `docs/CHANGES.md`.

## What exists (Phases 1 and 2)
- `auth`: register (LITIGANT/LAWYER), login, logout, forgot/reset password, `GET /auth/me`.
- `users`: `GET`/`PATCH /users/me`, `GET /users` (ADMIN only, paginated, filter by role/status/search).
- `audit`: append-only audit writer (register, login success/failure, logout, password reset, profile update).
- `health`: `GET /health` (includes a database ping).
- `integrations`: mocked NADRA CNIC check and mocked email sender (writes to the console).
- `cases` (Phase 2): case filing for LITIGANT and LAWYER. Users only see their own cases (others get 404).
  - `POST /cases` (multipart: JSON in the `data` field, PDFs in `files`), `GET /cases`, `GET /cases/summary`, `GET /cases/:id`
  - `POST /cases/:id/documents`, `GET /cases/:id/documents/:docId/download`
  - Case number (UCN): `DA-<YYYY>-<CIV|CRA|WRT|BAL>-<6 digits>`, e.g. `DA-2026-CIV-000045`; generated atomically per year and case type.
  - Uploads: PDF only (extension and `%PDF-` check), 25 MB each, up to 10 files per request. Files are stored under random names in `UPLOAD_DIR`; the original name and SHA-256 are kept in the database.
- Empty, documented folders for later modules: `hearings`, `payments`, `evidence`, `summons`, `chamber`, `internship`, `reports`, `notifications`.

## Conventions
- Every route is protected by default (global `JwtAuthGuard` + `RolesGuard`). Opt out with `@Public()`, restrict with `@Roles('ADMIN', ...)`.
- Input is validated by DTOs; unknown properties are rejected (`whitelist` + `forbidNonWhitelisted`).
- Errors share one shape: `{ statusCode, code, message, details?, path, timestamp }`.
- Database changes only through Prisma migrations (`npx prisma migrate dev --name <change>`).
- User-facing messages live in `src/common/messages.ts`.

## Commands
```powershell
npm install               # also runs prisma generate
npx prisma migrate deploy # apply migrations
npm run prisma:seed       # sample data + dev accounts (docs/DEV_ACCOUNTS.md)
npm run start:dev         # watch mode
npm test                  # unit tests
npm run test:e2e          # e2e tests on digitaladaalat_test (.env.test)
npm run lint
npm run build
```

## Environment
Copy `.env.example` to `.env` (development) and `.env.test` (tests, `digitaladaalat_test` database). Both real files are git-ignored.

File storage and upload limits (all optional, defaults shown in `.env.example`):
- `UPLOAD_DIR`: where case PDFs are stored (default `./uploads`, git-ignored)
- `UPLOAD_TMP_DIR`: temporary upload folder (default: OS temp folder)
- `UPLOAD_THROTTLE_LIMIT`: upload requests per minute per IP (default 20)
