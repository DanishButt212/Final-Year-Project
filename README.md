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

**Case filing API (Phase 2).** Verified lawyers use **Lawyer → File a Case**, backed by `POST /cases` (multipart). Enter the represented litigant as the first petitioner using their CNIC. The signed-in lawyer is recorded as filer and counsel. A litigant whose account CNIC matches a represented petitioner can view the case, documents and hearing updates. Earlier cases remain accessible to their recorded filers. Additional pleadings use the lawyer-only `POST /cases/:id/documents` route. Each case gets a number like `DA-2026-CIV-000045` (`CIV`, `CRA`, `WRT` or `BAL` by case type). Uploads are PDF only, 25 MB each, stored in `UPLOAD_DIR` (default `backend/uploads`, git-ignored). Optional env vars are `UPLOAD_DIR`, `UPLOAD_TMP_DIR` and `UPLOAD_THROTTLE_LIMIT` (see `backend/.env.example`).

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

**Summons and the Process Server console (Phase 4C).**

| Area | Routes |
|---|---|
| Admin | `POST /admin/summons`, `GET /admin/summons`, `GET /admin/summons/:id`, `PATCH /admin/summons/:id/assign`, `POST /admin/summons/:id/cancel`, `GET /admin/summons/:id/proof/photo` and `/signature`, `POST /admin/summons/:id/verify-seal`, `GET /admin/process-servers`, `GET /admin/cases/:id/summons-parties` |
| Process server (Bearer or cookie) | `GET /server/roster`, `GET /server/summary`, `GET /server/summons/:id`, `POST /server/summons/:id/attempts`, `POST /server/summons/:id/finalize` (multipart: photo, signature, latitude, longitude, accuracyM, notes, serviceMode), `GET` and `PATCH /server/profile`, `GET /server/profile/photo` |
| Case side | `GET /cases/:id/summons`, `GET /summons/:id/proof.pdf`, `GET /summons/:id/proof/photo` and `/signature` (judge and admin) |

New settings (System Policies): `summons_max_gps_accuracy_m` (default 100, 10 to 500) and `summons_default_due_days` (default 7, 1 to 90).

**Environment variable `SUMMONS_SEAL_SECRET`** (required): 32 random bytes, base64, used for the HMAC seal of execution proofs. The summons module refuses to start without it. Generate one into your local `backend/.env` with the same `node -e` command as the evidence key; `.env.example` only holds a placeholder. Never commit it. Changing it makes older seals report "tampered".

The Process Server console is a mobile-first web page at `/process-server` (Duty Roster and Profile with a bottom navigation). It asks the browser for the device location, so use `localhost` or HTTPS. The Expo mobile app (a later phase) will use the same `/server/*` API with a Bearer token.

**Judge decisions, audit vault, security alerts and reports (Phase 4E).**

| Area | Routes |
|---|---|
| Judge | `POST /judge/hearings/:id/outcome` (COMPLETED or ADJOURNED with order notes, hearing dated today or earlier), `POST /judge/cases/:id/decide` (JUDGMENT, DISMISSED or DISPOSED with the order text), `GET /judge/cases/:id` (now with hearing outcomes and the decision) |
| Audit vault (read-only) | `GET /admin/audit-logs`, `GET /admin/audit-logs/facets`, `GET /admin/audit-logs/verify?from&to`, `GET /admin/audit-logs/:id` |
| Security | `GET /admin/security/summary`, `GET /admin/security/alerts?status`, `GET /admin/security/alerts/:id`, `POST /admin/security/alerts/:id/blacklist`, `POST /admin/security/alerts/:id/dismiss`, `GET /admin/security/blocked-hosts`, `DELETE /admin/security/blocked-hosts/:id`, `GET /admin/security/events` |
| Reports | `GET /admin/reports/options`, `GET /admin/reports/performance`, `POST /admin/reports/export` (streams the PDF or Excel file), `GET /admin/reports/history`, `GET /admin/reports/:id/download`, `POST /admin/reports/:id/verify` |

New setting (System Policies): `security_escalation_threshold` (default 3, range 1 to 20).

**Environment variables.** `REPORT_SEAL_SECRET` (required): 32 random bytes, base64, the HMAC key of the report verification seal; generate it into your local `backend/.env` with the same `node -e` command as the evidence key. The reports module refuses to start without it. Never commit it. `TRUST_PROXY` (optional): set it (for example `1`) only when the API runs behind a reverse proxy, so `req.ip` is the real client address; without it the security alerts and host blocking would see the proxy address. Exported reports are stored under `backend/uploads/reports` (git-ignored).

**Judge orders, intern certificate and Pakistan time (Phase 5B).**

| Area | Routes |
|---|---|
| Judge | `GET /judge/orders?search&outcome&page&limit` (hearing orders and final decisions on the judge's own cases) |
| Lawyer | `GET /chamber/interns/:id/certificate`, `POST /chamber/interns/:id/certificate` (needs one approved research log; once per intern), `GET .../certificate/pdf`, `POST .../certificate/verify` |
| Intern | `GET /intern/certificate`, `GET /intern/certificate/pdf`, `POST /intern/certificate/verify` |

Certificates are numbered `CERT-YYYY-000001`, sealed with HMAC-SHA256 (keyed with `REPORT_SEAL_SECRET`) and rendered as a PDF on demand. Hearing slots and "today" are always computed in Pakistan time; set `TZ=Asia/Karachi` (in `.env.example` and `render.yaml`) so library formatting matches, otherwise the API logs a warning at startup. Project status: `docs/PROJECT_STATUS.md`.

**Run the backend from the build if the watcher is unreliable** (`npm run build`, then `node dist/main`): `npm run start:dev` deletes `dist` while it recompiles, and a login attempt in that moment shows "Cannot reach the server".

### 3. Frontend (http://localhost:5173)
```powershell
cd frontend
npm install
npm run dev
```
The app calls `/api` on its own origin: Vite proxies it to `http://localhost:4000` in development and Vercel rewrites it to the Render API in production, so no `.env` is needed. Set `VITE_API_URL` only to call an API on another origin directly.

**Storage driver.** `STORAGE_DRIVER=local` (default) keeps files under `backend/uploads`; `STORAGE_DRIVER=s3` with `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` uses an S3-compatible bucket (Cloudflare R2, Supabase Storage). Evidence and summons proofs are encrypted before they reach either driver. The API refuses to start, naming the variables (never their values), when `DATABASE_URL`, `JWT_SECRET`, `EVIDENCE_ENCRYPTION_KEY`, `SUMMONS_SEAL_SECRET` or `REPORT_SEAL_SECRET` is missing, or, in production, `FRONTEND_URL` (the old name `FRONTEND_ORIGIN` still works).

**Languages and UI tools.** The interface is in English and Urdu (`npm run i18n:check` fails on a missing Urdu
translation, `npm run i18n:lint` reports untranslated text, `npm run i18n:extract` regenerates the English catalogue).
`node scripts/shots.mjs <name> <path> [--w=375] [--lang=ur] [--role=JUDGE] [--axe]` takes a screenshot of the running
dev stack into the git-ignored `e2e/artifacts/shots/` (and, with `--axe`, prints serious or critical accessibility
issues); it reads the dev accounts itself and never prints them.

### Hearing clashes and Chamber Portal

1. In **Lawyer → Hearings**, use **Report clash** on the affected hearing. Chamber members can share the request with a chamber or nominate a lawyer privately.
2. A chamber owner can add a verified lawyer by bar number and allocate available counsel in the separate **Chamber Portal** at `/chamber`. Private nominees must accept from **Lawyer → Hearing clashes** before the Reader sees the request.
3. The Reader reviews requests under **Hearing clashes**. The hearing's assigned judge makes the final decision under **Judge → Hearing clashes**. An approved substitute can open the case documents on the scheduled day in Pakistan time.
4. In **Bench Scheduling**, the Reader can mark a hearing as **Last summons**. A flagged clash requires changing the hearing date through the scheduling board.
5. In **Judge → Case → Hearings**, open **Record lawyer absence** and mark the lawyer absent. The judge can then select **Impose Fine** or **No Fine**. An imposed fine appears as **Awaiting Fine Amount** for the Reader assigned when the hearing was scheduled. The Reader confirms the PKR amount, which appears on the judge’s hearing record. **No Fine** closes the absence.

Run `npm run test:e2e -- hearing-coverage.e2e-spec.ts` in `backend` to verify the workflow and its access rules.
Set `COVERAGE_BROWSER_URL=http://localhost:5173` to also run the browser handoffs with the frontend running locally. The browser test routes API calls to the isolated test database and uses Microsoft Edge by default.

### Document deliveries

1. In the Reader portal, open a case with an attached PDF and choose **Deliveries**. Select the PDF, a recipient and an active Process Server. Confirm the address and due date. Assign the same document separately to each recipient.
2. In the Process Server portal, choose **Deliveries**. Open the document and use the viewer's **Print** button if needed. Mark the task **Out for Delivery**, then submit the visit outcome, date and time, and remarks. For delivery, record who received it and optionally attach a PDF, JPG or PNG acknowledgment up to 5 MB. For an unsuccessful visit, enter the reason.
3. In the Reader's case **Deliveries** tab, accept the report, request clarification, or assign another visit. A retry can use a corrected address or a different officer. The earlier outcomes and addresses remain in history.
4. The assigned judge can see reviewed reports in the case's **Deliveries** tab. **Forward to judge** on an accepted report also adds a case timeline entry and sends an in-app notification. A refusal remains recorded as **Refused**.

Run `npm run test:e2e -- deliveries.e2e-spec.ts` in `backend` to exercise multi-recipient service, encrypted acknowledgments, refusal, reassignment, and direct document access.

### Hearing transcripts

1. Apply migrations with `npm run prisma:deploy` in `backend`, then rebuild and restart the API.
2. In **Reader → Accounts**, create a Stenographer account and use the generated password setup link. Use **Bench Scheduling** to schedule a hearing, then **Stenographer assignments** to assign it by case number. In the case's **Parties** tab, assign any unrepresented party a verified lawyer using their bar number.
3. Sign in as the stenographer. Open the assigned hearing, write and save a draft, preview its PDF and submit it. A returned transcript shows the judge's correction note and can be edited and resubmitted.
4. Sign in as the hearing's assigned judge. Open **Hearing transcripts**, preview the submitted PDF, and either return it with a correction note or approve it. Choose **Digitally sign and publish** after approval.
5. Sign in as each assigned lawyer. Open the case and select **Hearing transcripts** to preview or download the signed PDF. Before signing, the transcript list excludes it and direct PDF requests are denied.

Configure OpenSSL on the API host and set `TRANSCRIPT_OPENSSL_PATH` if the executable is outside PATH. Set `TRANSCRIPT_SIGNING_DIR` to a private directory accessible only to the API service account. Within that directory, use the judge's user UUID (shown in the Reader accounts API response) as the directory name. Put the judge's PEM certificate and matching private key in `certificate.pem` and `private-key.pem`. If needed, provide `certificate-chain.pem` for intermediate certificates and `key-passphrase.txt` for an encrypted private key. Manage the directory and passphrase as deployment secrets and keep them outside the repository and upload storage. For a development demo, a self-signed certificate can demonstrate verification when the verifier explicitly trusts it. For deployment, provision judge-specific certificates trusted by the intended PDF viewers and manage key access and rotation through the court's signing policy. Signing stays unavailable until the judge's certificate is configured. Set `TRANSCRIPT_FONT_PATH` to a PDFKit-compatible font covering the transcript language when the built-in Latin font is insufficient.

Run `npm run test:e2e -- transcripts.e2e-spec.ts` in `backend` to exercise review, correction, publication, direct-link access and cryptographic verification with a temporary test certificate.

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

### 5. Deployment (Neon, Render, Vercel)
Step by step in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): `render.yaml` (API; build `npm ci --include=dev && npm run build:deploy` runs `prisma migrate deploy`, start `npm run start:prod`, health check `/api/health`), `frontend/vercel.json` (rewrites `/api/*` to Render, SPA fallback) and `npm run seed:demo` (demo data with `DEMO_PASSWORD`, never next to real data). The Prisma CLI uses `DIRECT_URL` when set (Neon direct connection); the app uses `DATABASE_URL` (pooled).

Never commit `.env` files or `docs/DEV_ACCOUNTS.md`. They are git-ignored; only `.env.example` files are tracked.

**Database update (16-11-2026).** The Virtual Courtroom module has been removed. From `backend`, run `npm run prisma:deploy` to apply `20261116000000_remove_virtual_courtroom`. This removes only courtroom session/participant tables and the virtual-hearing flag, and converts existing virtual hearings to physical hearings. Hearings, cases and historical audit/case events are retained. Earlier migrations remain unchanged.

**Role naming.** The role previously shown as Admin / Administrator / Administration is now shown as Reader throughout the English and Urdu portals. Existing `ADMIN` authorization identifiers and `/admin` routes remain compatible with existing accounts and links.

**JazzCash demo payments.** Checkout supports card or JazzCash in the simulated gateway. JazzCash test number `03000000000` succeeds; `03000000001` declines for insufficient funds; all other numbers decline. No real funds, PIN or OTP are used, and wallet numbers are not stored. Receipts and payment history identify JazzCash. Apply `20261116010000_add_jazzcash_payment` with `npm run prisma:deploy` from `backend` before using the new method.

**Easypaisa demo payments.** Easypaisa is available alongside card and JazzCash with the same demo wallet numbers, history and receipts. Apply `20261116020000_add_easypaisa_payment` using `npm run prisma:deploy` from `backend`. No real payments, PIN or OTP are involved.

**Bank transfer demo payments.** Checkout also supports Bank transfer using the existing `MOCK_BANK_TRANSFER` method (no new migration). `DEMO-BANK-APPROVED` succeeds; `DEMO-BANK-DECLINED` simulates insufficient funds; other references decline. No real bank account details or money transfers are involved. Payment history and receipts identify Bank transfer.
