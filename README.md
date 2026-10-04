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

## Git workflow

- Work directly on `main` in small logical commits; run `npm run build` and `npm run lint` in `backend/` and `frontend/` and `git pull origin main` before every push. Never force push.
- The `danish` branch is kept as a backup.

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

**Hearings, cause lists and anti-clash scheduling (Phase 3B).**

| Area | Routes |
|---|---|
| Anti-clash check (UC-3.2) | `POST /admin/scheduling/check` (dry run), `POST /admin/scheduling/run-check` (scan a court and date) |
| Board (UC-3.1) | `GET /admin/scheduling/board?courtId&date`, `GET /admin/scheduling/week?courtId&weekStart` |
| Vacancy mapping (UC-3.3) | `GET /admin/scheduling/available-slots?caseId&from&days&excludeHearingId`, `GET /admin/scheduling/schedulable-cases?courtId` |
| Hearings | `POST /admin/hearings`, `PATCH /admin/hearings/:id/reschedule`, `POST /admin/hearings/:id/cancel`, `POST /admin/scheduling/auto-generate` |
| Cause lists | `POST /admin/cause-lists/publish`, `GET /admin/cause-lists?courtId&date`, `GET /cause-lists?date&courtroomId&courtId` (any signed-in user) |
| Users | `GET /hearings/mine?when=upcoming\|past` (litigant, lawyer), `GET /judge/hearings?from&to` (judge); `GET /cases/:id` also returns `hearings` and `nextHearing` |

Extra policy settings (System Policies page): `court_day_start` (default `09:00`), `court_day_end` (`14:00`) and `hearing_slot_minutes` (`30`). Courts sit Monday to Friday. A judge, a courtroom and every lawyer of the case must be free in a slot; the database also enforces one active hearing per judge and per courtroom per date and slot with partial unique indexes (see `docs/CHANGES.md`).

**Fees, payments, evidence vault, preferences and feedback (Phase 4A).**

| Area | Routes |
|---|---|
| Challan (UC-4.1) | `POST /cases/:id/challan` (idempotent), `GET /cases/:id/challan`, `GET /challans/:id/pdf` |
| Payment (UC-4.2) | `POST /payments/checkout`, `POST /mock-gateway/authorize` (simulated gateway) |
| Receipts (UC-4.3) | `GET /payments/mine`, `GET /payments/:id/receipt` (PDF) |
| Evidence vault (UC-5.1, 5.2) | `GET /cases/:id/vault`, `POST /cases/:id/evidence` (multipart), `PATCH` and `DELETE /cases/:id/evidence/:eid`, `GET /cases/:id/evidence/:eid/download`, `GET /cases/:id/pleadings/:docId/download` |
| Judge | `GET /judge/cases/:id`, `POST /judge/cases/:id/evidence/lock` |
| Preferences (UC-5.3) | `GET` and `PUT /users/me/notification-preferences` |
| Feedback (UC-5.4) | `POST /feedback`, admin `GET /admin/feedback`, `PATCH /admin/feedback/:id` |

New settings (System Policies): `ad_valorem_percent` (default 1, 0 to 10), `ad_valorem_cap_pkr` (50000), `challan_due_days` (7), `max_evidence_mb` (100, 1 to 200).

**Environment variable `EVIDENCE_ENCRYPTION_KEY`** (required): 32 random bytes, base64. The evidence module refuses to start without it. Generate one into your local `backend/.env` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; `.env.example` only holds a placeholder. Never commit it. If the key is lost, existing encrypted exhibits cannot be decrypted.

The payment gateway is simulated. Test cards: `4242 4242 4242 4242` and `5555 5555 5555 4444` approve, `4000 0000 0000 0002` is declined (insufficient funds), every other number is declined. Card details are never stored or logged.

**Lawyer chamber and legal intern portals (Phase 4B).**

| Area | Routes |
|---|---|
| Chamber login | `POST /auth/login` with the extra field `chamberCode` (Chamber desk login form) |
| Chamber profile | `GET` and `PUT /chamber/profile`, `GET /chamber/dashboard`, `GET /chamber/cases` |
| Clients | `GET` and `POST /chamber/clients`, `GET` and `PATCH /chamber/clients/:id`, `GET /chamber/client-options` |
| Billing and retainers | `POST` and `GET /chamber/billable`, `POST /chamber/clients/:id/retainer/deposit`, `GET /chamber/retainer-summary`, `POST /chamber/clients/:id/low-balance-alert` |
| Expenses | `GET` and `POST /chamber/expenses` |
| Interns (lawyer side) | `GET` and `POST /chamber/interns`, `GET /chamber/interns/:id`, `PATCH /chamber/interns/:id/status`, `GET /chamber/research-logs`, `PATCH /chamber/research-logs/:id/review` |
| Intern (own side) | `GET /intern/summary`, `GET /intern/cases`, `GET` and `POST /intern/research-logs`, `PATCH /intern/research-logs/:id`, `POST /intern/attendance/check-in`, `POST /intern/attendance/check-out`, `GET /intern/attendance?month=YYYY-MM` |
| Admin | `PATCH /admin/courts/:id` (latitude, longitude, geofenceRadiusM); `POST /admin/users` for an INTERN needs `supervisorLawyerId` |

New settings (System Policies): `attendance_default_radius_m` (default 300, 50 to 5000) and `attendance_max_accuracy_m` (default 150, 10 to 1000).

Chamber desk login: after seeding, a verified lawyer finds the Chamber ID (format `CH-123456`) on Chamber Settings & Identity Profile. The seeded court coordinates for Multan are approximate placeholders. To test attendance, open Courts & Benches as an administrator, stand where you want the geo-fence and use "Use my current location". The browser asks for the location permission (localhost counts as a secure origin).

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
