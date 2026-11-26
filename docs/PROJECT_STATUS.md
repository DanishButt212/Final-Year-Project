# DigitalAdaalat: Project Status (audit of main, 07-10-2026, updated after Phase 5C, the UX upgrade on 11-10-2026 and the workflow update on 26-11-2026)

Read-only audit of the code on `main`, updated after the Phase 5C QA fixes (full QA run with API scripts, Playwright journeys and axe; every QA issue is listed in `docs/CHANGES.md`, section Phase 5C). The full project report is not in the repo, so section 5 checks the rules in `docs/PROJECT_BRIEF.md`, `docs/CHANGES.md` and the exact strings in the code.

Workflow update (commit 90486ea, 25-11-2026; details in `docs/CHANGES.md`, section "Workflow update"): the virtual courtroom was removed (session controls, join pages, API endpoints, provider configuration and demo data; the removal migration keeps hearings and case history). Admin is shown as "Reader", only verified lawyers file new cases, the filing fee is fixed by case type with the challan issued at filing, and JazzCash, Easypaisa and bank transfer demo payments were added. New: the Stenographer role with hearing transcripts and the judge's digital signature, document deliveries reviewed by the Reader, hearing coverage (substitute lawyers, chamber members and the Chamber Portal, last summons) and lawyer absence fines. The counts below were taken from the code on 26-11-2026.

## 1. Overview
| Item | Value |
|---|---|
| Stack | NestJS 12 + Prisma 7 + PostgreSQL; React 19 + Vite 8 + TS, Tailwind 4, shadcn/ui, TanStack Query, RHF + Zod |
| Prisma | 48 models, 37 enums, 25 migrations |
| Backend | 26 Nest module files (app, prisma, health, settings, integrations and 21 feature modules; transcripts and hearing coverage are registered directly in the app module), 21 controller files, 180 route handlers |
| Frontend | 74 page/component files under `pages/`, 82 `<Route>` elements in `App.tsx`, 7 role portals |
| Roles | 7: LITIGANT, LAWYER, INTERN, PROCESS_SERVER, STENOGRAPHER, JUDGE, ADMIN (shown as "Reader") |
| Tests | 3 backend unit spec files (61 tests), 17 backend e2e suites (233 tests: 229 pass, 4 browser handoff tests skipped without `COVERAGE_BROWSER_URL`; includes transcripts, deliveries, hearing coverage and lawyer filing), 12 frontend test files (124 tests), 4 Playwright browser specs in `frontend/e2e` |

### UX upgrade (11-10-2026)
Eight phases on top of Phase 5C, details in `docs/CHANGES.md` (section "UX Upgrade") and `docs/UX_PROGRESS.md`:
brand and seal intro, public landing page and case status; English and Urdu (RTL, Nastaliq) with a text size control;
case progress stepper, next-hearing card, add to calendar and 08:00 reminders; Ctrl+K command palette; PDF viewer and
image lightbox, skeletons, success panels, copy buttons and retry states; dashboard charts per role; guided tour per
role and a 49-term legal glossary. New fields: `User.preferredLanguage`, `User.fontScale`, `User.tourCompletedVersion`,
`Notification.titleKey/bodyKey/params`; new table `HearingReminder`.

## 2. Features per role (C = Complete, P = Partial, S = Stub)
**LITIGANT**
- Register, login, password reset, profile: C
- Dashboard (case overview, next hearing): C
- New Case Submission: removed for litigants (workflow update); cases filed by their lawyer appear in the portfolio through the represented litigant CNIC
- Case portfolio and case detail (timeline, documents, decision block, summons status, proof-of-service PDF): C
- Hearing Schedule (upcoming/past) and Daily Cause Lists (own cases highlighted): C
- Court fee challan, mock payment (card, JazzCash, Easypaisa, bank transfer), receipt, payments history: C
- Evidence Vault (encrypted exhibits: upload, edit, delete, download): C
- Notification options, system feedback, in-app notifications (60 s polling): C

**LAWYER**: everything a litigant has, plus:
- Lawyer verification gate (filing blocked until VERIFIED): C
- New Case Submission for the represented litigant (multi-step wizard, PDF pleadings, UCN, challan issued at filing): C
- Hearing clashes: report, nominate a substitute or share with the chamber, accept or decline invitations; Chamber Portal for allocation and chamber members: C
- Signed hearing transcripts of their cases: C
- Chamber: dashboard, client directory and registration, billable hours, retainer deposits and low-balance alerts, expenses, chamber settings and ID card: C
- Interns: create intern accounts, change status, review research logs, issue the completion certificate: C
- Chamber desk login (Chamber ID + email + password): C

**INTERN**
- Dashboard, research logs (create, edit until approved): C
- Geo-fenced attendance check-in/out (browser GPS, radius per court): C
- Completion certificate: C (view, download PDF `CERT-YYYY-000001`, verify HMAC seal)

**PROCESS_SERVER**
- Mobile-first web console: duty roster, summons detail, attempts with GPS, finalize with photo + signature (HMAC sealed), profile: C
- Document deliveries: start, report attempts (delivered with receiver, or a reason), answer clarifications: C
- Native Expo app: S (`mobile/` holds only a README)

**STENOGRAPHER**
- Assigned hearings, write and save transcripts, submit for review, correct returned transcripts: C

**JUDGE**
- My Schedule (week view), Daily Cause Lists, My Allocated Cases, read-only case detail: C
- Record hearing outcome (completed/adjourned), decide a case (final, immutable), lock evidence: C
- Orders page (hearing orders and final decisions, search, outcome filter, link to case): C
- Hearing transcripts: review PDF, approve or return with a correction note, digitally sign: C (signing needs a configured certificate in `TRANSCRIPT_SIGNING_DIR`)
- Hearing clashes: approve or reject substitutions; record lawyer absences and decide Impose Fine or No Fine: C
- Forwarded delivery reports in the case Deliveries tab: C

**ADMIN (shown as "Reader")**
- Operations & Analytics dashboard: C
- Account management (provision staff with a one-time link, suspend, block, reactivate, soft delete): C
- Lawyer verification with mock Bar Council: C
- Case registry and allocation (manual or random, fewest active cases): C
- Courts & benches (courtrooms, geo-fence settings): C
- Bench Scheduling board (grid/agenda, drag to reschedule, anti-clash check, auto-generate, publish cause list): C
- Summons & notices registry (issue, assign, cancel, view sealed proof, verify seal): C
- System Policies, User Feedback analysis: C
- Audit vault (filters, event hashes, integrity verification): C
- Security alerts (escalation detection, session kill, host blacklist): C
- Reports (performance engine, sealed PDF/Excel export, history, verify): C
- Stenographer assignments: C
- Document deliveries per case (assign, review: accept, clarify, retry, forward to the judge): C
- Hearing clashes review queue, last-summons marking, fine amounts for absences: C
- Admin hardware token / MFA from the report: not built (logged in CHANGES)

## 3. Backend modules
| Module | What it does | Main endpoints |
|---|---|---|
| auth | Register (litigant/lawyer), login (cookie or Bearer), logout, reset | `/auth/register, login, logout, forgot-password, reset-password, me` |
| users | Own profile, notification prefs; admin user list | `/users/me`, `/users/me/notification-preferences` |
| admin | Dashboard stats, accounts, lawyer verification, courts, case registry, allocation, audit vault | `/admin/dashboard/stats, users, lawyers, courts, courtrooms, cases/:id/allocate, audit-logs` |
| cases | Filing (multipart, UCN), list, detail, extra documents, downloads | `/cases`, `/cases/:id/documents` |
| fees | Challan (fee formula), mock gateway, receipts | `/cases/:id/challan, /payments/checkout, /mock-gateway/authorize, /payments/:id/receipt` |
| transcripts | Stenographer assignments, drafts, review PDF, approval, digital signature | `/hearing-transcripts/*` (draft, submit, approve, return, sign, pdf), `/admin/transcript-assignments` |
| deliveries | Document deliveries, attempts, Reader review, encrypted acknowledgments | `/admin/cases/:id/deliveries, /admin/deliveries/:id/review, /server/deliveries/*, /judge/cases/:id/deliveries` |
| hearing-coverage | Clash requests, substitutes, chamber members, last summons, absences and fines | `/hearing-coverage/*` |
| evidence | Encrypted vault, judge lock | `/cases/:id/vault, /cases/:id/evidence, /judge/cases/:id/evidence/lock` |
| scheduling | Hearings, anti-clash, board, auto-generate, cause lists | `/admin/scheduling/*, /admin/hearings, /admin/cause-lists/publish, /hearings/mine, /judge/hearings, /cause-lists` |
| judge | Outcomes, decisions, allocated cases, orders list | `/judge/hearings/:id/outcome, /judge/cases/:id/decide, /judge/cases, /judge/orders` |
| summons | Issue/assign/cancel, server console, sealed proofs | `/admin/summons/*, /server/*, /cases/:id/summons, /summons/:id/proof.pdf` |
| chamber | Lawyer chamber silo, intern portal, completion certificates | `/chamber/*` (incl. `/chamber/interns/:id/certificate`), `/intern/*` (incl. `/intern/certificate`) |
| reports | Performance stats, export, verify | `/admin/reports/*` |
| security | Escalation alerts, blocked hosts | `/admin/security/*` |
| audit | Append-only writer with event hash (global) | (used by all modules) |
| notifications | In-app list/read + mock email/SMS/push | `/notifications` |
| feedback | Submit and review feedback | `/feedback, /admin/feedback` |
| settings | Policies (fees, slots, sizes, geo-fence, thresholds) | `/settings/public, /admin/settings` |
| public | Public case status by UCN (no login, 10/min, probe detection) | `/public/cases/status` |
| search | Command palette search inside the caller's case scope | `/search` |
| insights | Role-scoped dashboard chart data, cached 60 s per user | `/insights` |
| reminders | 08:00 PKT hearing reminders (cron, idempotent) and manual run | `/admin/reminders/run` |
| storage | Local disk or S3-compatible driver | (internal) |
| integrations | Mock NADRA, Bar Council, mailer | (internal) |
| health | Liveness + DB ping | `/health` |

## 4. Data model and security
- User 1-1 LawyerProfile / InternProfile / ProcessServerProfile / NotificationPreference; LawyerProfile 1-1 ChamberProfile; ChamberProfile 1-n ChamberMembership (-> LawyerProfile).
- Court 1-n Courtroom; Case -> Court, Courtroom, Judge (User), filedBy (User); Case 1-n CaseParty (-> LawyerProfile), CaseDocument, Evidence, CaseEvent, Hearing, Challan, Summons.
- Hearing -> Courtroom, Judge, Stenographer (User), Reader (User id); 1-1 CauseListEntry (-> CauseList per court/date), 1-1 HearingTranscript, 1-n HearingCoverage, 1-n HearingAbsence.
- Case 1-n DocumentDelivery (-> CaseDocument, CaseParty, process server) 1-n DocumentDeliveryAttempt 1-n DocumentDeliveryReview.
- Challan 1-n Payment; Summons 1-n SummonsAttempt; ChamberProfile -> ChamberClient -> BillableEntry, RetainerTransaction; ChamberExpense, ChamberAlertLog.
- InternDiaryEntry (research logs), Attendance, InternCertificate (1-1 InternProfile); AuditLog, SecurityEvent, SecurityAlert, BlockedHost, GeneratedReport, Feedback, Notification, SystemSetting, FeeStructure, CaseCounter.
- Security: JWT in httpOnly cookie (SameSite=Lax, Secure in prod) or Bearer; global JWT + role guards (RBAC); DTO validation; global throttling (100/min) with stricter auth/upload limits; helmet; AuditLog append-only DB trigger + SHA-256 event hash; AES-256-GCM for evidence and summons photos/signatures; HMAC-SHA256 seals for summons proofs, reports and intern certificates; privilege-escalation alerts with session invalidation and host blacklist; geo-fenced attendance and GPS accuracy checks; reset tokens hashed; card data never stored; 404 for non-owners and malformed ids.

## 5. Business rules and exact messages
Implemented (found in code):
- UCN `DA-YYYY-(CIV|CRA|WRT|BAL)-000001`, atomic counter; challan `CH-YYYY-000001`; receipt `RCPT-YYYY-000001`; client `CL-000001`; chamber `CH-123456`; reports `RPT-YYYY-000001`; certificates `CERT-YYYY-000001`.
- Mock gateway: 4242.../5555... approved, 4000 0000 0000 0002 declined, others "Payment Unsuccessful: Gateway rejected request details."
- PDF only, 25 MB (policy), max 10 files, magic-byte check; CNIC, phone, PKR, DD-MM-YYYY formats.
- Slots (always Pakistan time, independent of the server zone): working days only, 09:00-14:00 × 30 min (policy), no past slots; judge/courtroom unique per slot (partial unique indexes), lawyer clash in app; "Clear/Valid", "Schedule overlap resolved manually.", "Roster details not yet published. Check back later."
- "Attendance logged successfully. Location verified.", "Privilege escalation neutralized. Host blocked.", "Invalid username or password.", "Case registration is currently closed.", "Only PDF format files under 25MB are allowed."
Different or missing:
- Brief says a lawyer/judge must never be double-booked **on the same day**; code blocks the same **slot** only (several hearings per day allowed). Logged as a deliberate deviation in Phase 5B.
- Per-role login failure messages replaced by one generic message (logged).
- Admin hardware-token MFA: missing (logged).

## 6. Deviations (from CHANGES.md, condensed)
- Prisma, Vite + shadcn, Expo planned; NADRA, Bar Council, payment, email/SMS/push are mocks.
- Self-registration only for litigant/lawyer; staff provisioned by admin (lawyers create interns) via one-time links.
- New statuses/fields: PENDING_ASSIGNMENT, user status actions, soft delete; HELD shown as "Completed".
- Random allocation = fewest active cases, random tie-break; allocation requires a paid challan.
- Fee formula (base + ad valorem for civil suits, modifier); one active challan per case.
- Evidence categories and mock screening (magic bytes) instead of antivirus.
- Notifications in-app with polling (60 s) count as "real time".
- Research logs replaced the daily diary; geo-fence via browser GPS (spoofable, accepted).
- Summons workflow, privacy (filers never see server identity/coords), web console instead of native app for now.
- Judge outcome/decision rules, decided cases immutable, open summons cancelled on decision.
- Audit metadata sanitizer; escalation threshold 3 in 10 min; loopback never blocked.
- Report disposal-rate definition, 50,000-row export cap.
- Deployment: migrations in the Render build (free plan), DIRECT_URL via prisma.config.ts, FRONTEND_URL, TRUST_PROXY=2, S3 driver, seed:demo guard.
- Phase 5B: Pakistan time computed explicitly (TZ only a safety net, warning not failure); anti-clash per slot; certificate rules (one per intern, needs an approved log, seal keyed with REPORT_SEAL_SECRET, verify only for lawyer and intern).

Noticed in code, not in CHANGES: none left after Phase 5B (the per-slot rule, the stubs, the unused `ProcessServerPage` and the missing Phase 4D note were all addressed).

## 7. Not implemented or partial
- Expo process-server app: not started (`mobile/README.md` only); the web console covers the flow.
- QR biometric bridge: not started (brief: last priority).
- Admin MFA / hardware token: not built.
- Real NADRA, Bar Council, payment gateway, email/SMS: mocks only (by design).
- Deployment: prepared, not executed.

## 8. Known issues and risks
- No TODO/FIXME comments in the code (the only "XXX" hits are the phone format).
- Deployment files (render.yaml, vercel.json, S3 driver) were never run against Render, Vercel, Neon or a real bucket.
- Security: browser GPS can be spoofed; TRUST_PROXY must match the real proxy chain or the blacklist could block Vercel's address; blocked-host cache is in-memory (single instance only); throttling is in-memory (per instance).
- Performance: notification polling; report export capped at 50,000 rows; Render free plan sleeps (~1 min cold start).
- Vercel rewrite limits for large uploads (25 MB PDFs, evidence) are untested.
- Server clock: fixed in Phase 5B (Pakistan time computed explicitly; `TZ=Asia/Karachi` in render.yaml with a startup warning).
- Phase 5C: 35 QA issues addressed (34 fixed, QA-033 kept by decision); npm audit still reports 4 high and 22 moderate advisories in dev/build tooling (Prisma CLI 7.10.0 is the latest 7.x).
## 9. Deployment status
Prepared: `render.yaml` (`TZ=Asia/Karachi`, build runs `prisma migrate deploy`, start `node dist/main`, health `/api/health`), `frontend/vercel.json` (`/api` rewrite + SPA fallback), relative `/api` base URL + Vite proxy, S3-compatible storage driver, fail-fast env validation, `npm run seed:demo` with `DEMO_PASSWORD`, `.env.example` updates, `docs/DEPLOYMENT.md`.
You still do by hand: create Neon (pooled + direct URLs), R2/Supabase bucket and keys, generate 4 secrets; create the Render Blueprint and fill env values; set the Render URL in `vercel.json`; import into Vercel (root `frontend`); set `FRONTEND_URL` (`TZ` is already in the Blueprint); run `seed:demo` with `.env.production`; run the smoke-test checklist; take backups.

## 10. Suggested order of remaining work
1. Deploy following DEPLOYMENT.md and run the smoke test (Neon, bucket, Render, Vercel).
3. Expo process-server app (reuses `/server/*` with Bearer token).
4. Defense prep: demo script, seed:demo on the morning, backups.
