# DigitalAdaalat QA Report

Full QA and code-quality run on `main` (07-10-2026). Tests use only the local `digitaladaalat_test` database. No passwords, tokens or keys appear in this report.

Progress: Part 1 done · Part 2 done · Part 3 in progress · Part 4 to do · Part 5 to do

## Part 1: Static quality and code review

| Check | Result |
|---|---|
| `npm run build` (backend, frontend) | Pass |
| `npm run lint` | Backend 0 problems; frontend 9 warnings → **0** (fixed) |
| `tsc --noEmit` / `tsc -b` | Pass in both apps |
| `prisma validate` | Valid |
| Migrations on the empty test DB | All 12 apply cleanly (jest global setup runs `migrate deploy` on `digitaladaalat_test`) |
| Existing backend e2e (3 suites, 99 tests) | 3 stale tests failed (written before lawyers had to be verified and before `unpaidFees` was added) → **fixed**, 99/99 pass |
| Existing frontend unit tests (11 files, 115 tests) | 14 stale tests failed (UI changed in later phases) → **fixed or rewritten**, 115/115 pass |

**Lint warnings fixed (all `react-refresh/only-export-components`):** shared constants moved to `frontend/src/lib/query-keys.ts` and `frontend/src/pages/admin/admin-helpers.ts`; `challanKey` and `LOG_STATUS` made module-private; `buttonVariants` and `toast` kept next to their component with a justified disable comment (shadcn pattern); rule turned off for test helpers.

**npm audit**
| App | Result |
|---|---|
| Frontend | 0 vulnerabilities |
| Backend | 4 high, 22 moderate, 0 critical. All high ones come through the `prisma` CLI (`@prisma/config` → `deepmerge-ts`, `mysql2`), a dev/build-time dependency; the only "fix" npm offers is a downgrade to Prisma 6 (major), so not applied. Moderates: the Jest 30 tool chain (dev only) and `uuid` under `exceljs` (runtime; the advisory needs a caller-supplied buffer, which exceljs does not pass). No patch/minor upgrade resolves them. |

**Code review findings**
| Finding | Action |
|---|---|
| No `console.log`, no `any` in application code | — |
| Unused dependency `@radix-ui/react-label` (frontend) | **Removed** |
| `pg`, `passport`, `reflect-metadata`, `@prisma/client` look unused by grep but are runtime peers of the adapter / Nest | Kept |
| Multipart bodies (`POST /cases`, `POST /cases/:id/evidence`) are typed `Record<string, unknown>` but validated in the service with class-validator (`plainToInstance` + `validate`) | OK |
| Three raw `@Query('x')` params (`audit verify from/to`, `payments includeFailed`, `security events limit`) are parsed defensively (regex / boolean / clamped 1..200) | OK, low risk |
| Errors: the global filter returns `{statusCode, code, message, details?, path, timestamp}`; unknown errors become "Something went wrong. Please try again later." with no stack trace | OK |
| Role guards: every non-public route has a JWT guard; role restrictions verified by the automatic RBAC matrix (Part 2) | OK |
| Unbounded `findMany`: lists shown to users are paginated; unbounded reads are day/week-scoped (board, schedules) or aggregate inputs (performance report reads every case of the chosen year) | Report: performance report should aggregate in SQL if data grows (Low) |
| Missing indexes for common filters: `AuditLog(createdAt)` (vault default sort without filters), `Case(decidedAt)` (reports, judge orders), `Hearing(outcomeAt)` (judge orders) | **Needs decision** (schema change) |
| Hard-coded values that could be settings: courtroom window 15/60 min, live window 45 s, polling intervals, 50,000-row export cap, 72 h staff link | Report only (documented in CHANGES) |
| Large files (>700 lines): `scheduling.service.ts` 936, `SummonsRegistryPage.tsx` 857, `chamber.service.ts` 788, `AccountsPage.tsx` 772, `BoardDialogs.tsx` 764, `InternsPages.tsx` 727, `virtual-courtroom.service.ts` 705 | Report only: candidates for splitting |
| Frontend ships one 1.45 MB JS chunk (no route-level code splitting) | See Part 4 |

**Database checks (test DB):** audit-log trigger `audit_log_no_update_delete`, partial unique indexes `Hearing_judge_slot_active_key`, `Hearing_courtroom_slot_active_key`, `SecurityAlert_open_actor_key`, `SecurityAlert_open_ip_key` asserted in `backend/test/qa-platform.e2e-spec.ts` (Part 2).

## Part 2: Backend API and use-case tests

12 Jest + Supertest suites on `digitaladaalat_test` (`npm run test:e2e`): **207 tests, 207 passed**. New in this run: `test/fixtures.ts` (one account per role, courts, fees, file fixtures: small/20 MB/26 MB PDFs, renamed executable, real PNG, JPEG) and 9 new suites (108 tests).

| Suite | Tests | Covers |
|---|---|---|
| `rbac.e2e-spec.ts` | 9 | Every route (discovered from Nest metadata, 160+) called anonymously and as all 6 roles: anonymous 401, outside `@Roles` 403, allowed roles never 401/role-403/500; malformed ids give 400/404, never 500 |
| `qa-auth.e2e-spec.ts` | 14 | CNIC/phone/email/password validation, suspend/block/delete stop login (and old tokens), reactivation, staff provisioning one-time link (used once), lawyer verification gate, mock Bar Council, CH-XXXXXX chamber on verification, chamber desk login |
| `qa-filing-fees.e2e-spec.ts` | 18 | UCN per case type, 10 parallel filings unique and sequential, 10-file limit, 20 MB accepted / 26 MB refused, magic-byte check, registration closed, party-only documents, fee formula, one challan per case, all test cards, RCPT numbers, double payment blocked, no card number anywhere in the DB, allocation (paid challan, manual, random fewest-cases) |
| `qa-scheduling.e2e-spec.ts` | 14 | 10 slots 09:00-14:00, weekends/past/out-of-hours refused, past slot today, judge/courtroom/lawyer clash messages, several per day, Clear/Valid, cancel frees slot, reschedule + "Schedule overlap resolved manually.", 4 parallel bookings → 1 wins, auto-generate, unpublished message, publish; same results with TZ=UTC, Asia/Karachi, America/New_York |
| `qa-judge-evidence.e2e-spec.ts` | 8 | Judge scope (404 for others), outcomes once, future outcome refused, decision immutable (no re-decide, re-allocate, exhibits), open summons cancelled, Orders list scope/search/filter, evidence encrypted at rest + decrypted download, non-party 404, owner-only edit, judge lock blocks edit/delete |
| `qa-summons.e2e-spec.ts` | 7 | Issue needs allocated case, assign, GPS required (422), finalize only after an attempt, photo + signature, HMAC seal valid, tampered proof detected, filer privacy (no server identity/coordinates), proof PDF, cancel |
| `qa-chamber.e2e-spec.ts` | 11 | CL-000001 per chamber, duplicate CNIC, chamber silo (404), retainer deposit, billable (0.25 h steps), derived balance, low-balance alert, expenses, intern account, research logs only on the lawyer's cases, editable until approved, geo-fence inside/outside/low accuracy, once per day, certificate rules, seal verify and tamper, access 404/403, notification and audit |
| `qa-virtual.e2e-spec.ts` | 9 | Non-virtual 404/409, lobby-locked message, party-only access, initialize + notification, JaaS credentials and moderator flags (fake provider), events, mute/video/eject/readmit with tags, judge protected, NOT_YET/CLOSED window, end session |
| `qa-platform.e2e-spec.ts` | 18 | Trigger and partial indexes exist, UPDATE/DELETE on AuditLog refused, notifications read/read-all, e-mail preference respected, feedback submit/review, settings take effect (slot length, file size, fees) and validation, 3 refused admin calls → alert + session ended + block message + loopback note, hashed audit rows without secrets, tamper detected by integrity check, helmet headers, CORS refuses unknown origins, performance stats, PDF/Excel export RPT code + seal, 50,000-row cap message |

**Product bugs found by the API tests: none.** Notes (not bugs):
- POST actions answer 200 or 201 inconsistently (for example decide 201 vs evidence lock 200, report verify 201 vs seal verify 200). Low; the frontend does not depend on it.
- Evidence description validation runs before the ownership check (a non-party gets 400 for an invalid body, 404 for a valid one). No information leak. Low.
