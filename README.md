# Final-Year-Project
## Project structure

```
backend/        NestJS API (Prisma, PostgreSQL)
frontend/       React + Vite web portals
mobile/         Expo app for process servers (later)
docs/           Project brief and change log
design-system/  Locked design system (MASTER.md)
CLAUDE.md       Instructions for Claude Code
```

See `docs/PROJECT_BRIEF.md` for the full project brief.

## Branch workflow

- `main` is protected by convention: never commit or push to it directly.
- Each team member works on a personal branch (for example `danish`).
- Changes reach `main` through pull requests, reviewed by Danish.

## Getting started (Windows)

Requirements: Node.js 20.19+ (tested on 24), npm, PostgreSQL 16 or 17 on `localhost:5432` (or Docker Desktop, see below).

### 1. Database
Create two empty databases, `digitaladaalat` (development) and `digitaladaalat_test` (automated tests):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE digitaladaalat;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE digitaladaalat_test;"
```

No local PostgreSQL? `docker compose up -d` starts PostgreSQL 17 and creates both databases (optional alternative; set `POSTGRES_PASSWORD` first).

### 2. Backend (http://localhost:4000/api, Swagger at http://localhost:4000/api/docs)
```powershell
cd backend
npm install
Copy-Item .env.example .env
Copy-Item .env.example .env.test
```
Edit both files: put your PostgreSQL password into `DATABASE_URL` (use the `digitaladaalat_test` database in `.env.test`) and set `JWT_SECRET` to a random value (use a different one per file):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then create the tables and sample data, and start the API:

```powershell
npx prisma migrate deploy      # applies all migrations, including the append-only audit trigger
npm run prisma:seed            # courts, fees, sample cases and one dev account per role
npm run start:dev              # http://localhost:4000/api
```

The seed prints the development passwords once and writes them to `docs/DEV_ACCOUNTS.md` (git-ignored, local only). Re-running the seed generates new passwords.
After changing `prisma/schema.prisma`, create a migration with `npx prisma migrate dev --name <what_changed>`.

**Case filing API (Phase 2).** Litigants and lawyers use `POST /cases` (multipart), `GET /cases`, `GET /cases/summary`, `GET /cases/:id`, `POST /cases/:id/documents` and `GET /cases/:id/documents/:docId/download`. Each case gets a number like `DA-2026-CIV-000045` (`CIV`, `CRA`, `WRT` or `BAL` by case type). Uploads are PDF only, 25 MB each, stored in `UPLOAD_DIR` (default `backend/uploads`, git-ignored). Optional env vars: `UPLOAD_DIR`, `UPLOAD_TMP_DIR`, `UPLOAD_THROTTLE_LIMIT` (see `backend/.env.example`).

**Admin portal and allocation API (Phase 3A).** All `/admin/*` routes are ADMIN-only and write an audit entry for every change.

| Area | Routes |
|---|---|
| Analytics (UC-1.3) | `GET /admin/dashboard/stats?courtId=` |
| Accounts (UC-2.1) | `GET /admin/users`, `POST /admin/users` (provision INTERN, PROCESS_SERVER, JUDGE, ADMIN; returns the reset link once), `PATCH /admin/users/:id/status` (`suspend`, `block`, `reactivate`, `delete`) |
| Lawyer verification (UC-2.2) | `GET /admin/lawyers?status=PENDING\|VERIFIED\|REJECTED`, `POST /admin/lawyers/:id/bar-check`, `/verify`, `/reject` |
| Policies (UC-2.3) | `GET` and `PUT /admin/settings`, public `GET /settings/public` |
| Courts | `GET /admin/courts`, `POST /admin/courtrooms`, `PATCH /admin/courtrooms/:id` |
| Cases | `GET /admin/cases`, `GET /admin/cases/:id`, `GET /admin/cases/:id/documents/:docId/download`, `POST /admin/cases/:id/allocate` (`MANUAL` or `RANDOM`) |
| Notifications (all roles) | `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |
| Judge | `GET /judge/cases` |

Policy settings (table `SystemSetting` and `FeeStructure`): `max_attachment_mb` (integer 1 to 100, default 25), `case_registration_open` (true/false), `filing_fee_rate_modifier` (percent 0 to 100, default 0) and the filing fee per case type. Uploads read the limit at request time. Lawyers must be VERIFIED before they can file a case. Suspended, blocked or deleted users are refused at login and on every later request. The mock Bar Council finds numbers like `LH-45821` and reports `LH-99999` as revoked.

### 3. Frontend (http://localhost:5173)
```powershell
cd frontend
npm install
Copy-Item .env.example .env      # optional: only needed if the API is not on localhost:4000
npm run dev
```

### 4. Tests and checks
```powershell
cd backend
npm test            # unit tests
npm run test:e2e    # end-to-end tests against digitaladaalat_test (migrations are applied first)
npm run lint
npm run build

cd ..\frontend
npm test
npm run lint
npm run build
```

Never commit `.env` files or `docs/DEV_ACCOUNTS.md`. They are git-ignored; only `.env.example` files are tracked.
