# DigitalAdaalat QA Report

Full QA and code-quality run on `main` (07-10-2026). Tests use only the local `digitaladaalat_test` database. No passwords, tokens or keys appear in this report.

Progress: Part 1 done · Part 2 in progress · Part 3 to do · Part 4 to do · Part 5 to do

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
