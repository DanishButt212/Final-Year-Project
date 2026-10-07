# DigitalAdaalat: Project Status (audit of main, 07-10-2026)

Read-only audit of the code on `main`. Nothing was built, tested or run for this report. The full project report is not in the repo, so section 5 checks the rules in `docs/PROJECT_BRIEF.md`, `docs/CHANGES.md` and the exact strings in the code.

## 1. Overview
| Item | Value |
|---|---|
| Stack | NestJS 12 + Prisma 7 + PostgreSQL; React 19 + Vite 8 + TS, Tailwind 4, shadcn/ui, TanStack Query, RHF + Zod |
| Prisma | 40 models, 35 enums, 11 migrations (3 hand-written: audit trigger, partial unique indexes, 4F) |
| Backend | 22 Nest modules (17 feature + app, prisma, health, settings, integrations), 16 controller files, 153 route handlers |
| Frontend | 68 page/component files under `pages/`, 59 routes, 6 role portals |
| Roles | LITIGANT, LAWYER, INTERN, PROCESS_SERVER, JUDGE, ADMIN |
| Tests | 2 backend unit specs, 3 e2e specs (auth, users, cases), 11 frontend test files (login, register, filing, portfolio, case detail, routing) |

## 2. Features per role (C = Complete, P = Partial, S = Stub)
**LITIGANT**
- Register, login, password reset, profile: C
- Dashboard (case overview, next hearing): C
- New Case Submission (multi-step wizard, PDF pleadings, UCN): C
- Case portfolio and case detail (timeline, documents, decision block, summons status, proof-of-service PDF): C
- Hearing Schedule (upcoming/past) and Daily Cause Lists (own cases highlighted): C
- Court fee challan, mock card payment, receipt, payments history: C
- Evidence Vault (encrypted exhibits: upload, edit, delete, download): C
- Notification options, system feedback, in-app notifications (60 s polling): C
- Join Remote Hearing Video Room (lobby lock, 15-minute window, full-page room): C (only API-tested, see 8)

**LAWYER**: everything a litigant has, plus:
- Lawyer verification gate (filing blocked until VERIFIED): C
- Chamber: dashboard, client directory and registration, billable hours, retainer deposits and low-balance alerts, expenses, chamber settings and ID card: C
- Interns: create intern accounts, change status, review research logs: C
- Chamber desk login (Chamber ID + email + password): C

**INTERN**
- Dashboard, research logs (create, edit until approved): C
- Geo-fenced attendance check-in/out (browser GPS, radius per court): C
- Completion certificate: S (sidebar item shows "coming later"; no backend)

**PROCESS_SERVER**
- Mobile-first web console: duty roster, summons detail, attempts with GPS, finalize with photo + signature (HMAC sealed), profile: C
- Native Expo app: S (`mobile/` holds only a README)

**JUDGE**
- My Schedule (week view), Daily Cause Lists, My Allocated Cases, read-only case detail: C
- Record hearing outcome (completed/adjourned), decide a case (final, immutable), lock evidence: C
- Join virtual hearing from My Schedule: C (only API-tested)
- Orders page: S (sidebar "Orders" falls to the "coming later" page; orders live on the case page)
- Dashboard "Today's cause list" and "Recent orders" panels: S (static empty panels)

**ADMIN**
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
- Virtual Courtroom Control (initialize, attendee list, mute/video/eject/readmit, end): C in code; moderation needs JaaS keys; only API-tested
- Admin hardware token / MFA from the report: not built (logged in CHANGES)

## 3. Backend modules
| Module | What it does | Main endpoints |
|---|---|---|
| auth | Register (litigant/lawyer), login (cookie or Bearer), logout, reset | `/auth/register, login, logout, forgot-password, reset-password, me` |
| users | Own profile, notification prefs; admin user list | `/users/me`, `/users/me/notification-preferences` |
| admin | Dashboard stats, accounts, lawyer verification, courts, case registry, allocation, audit vault | `/admin/dashboard/stats, users, lawyers, courts, courtrooms, cases/:id/allocate, audit-logs` |
| cases | Filing (multipart, UCN), list, detail, extra documents, downloads | `/cases`, `/cases/:id/documents` |
| fees | Challan (fee formula), mock gateway, receipts | `/cases/:id/challan, /payments/checkout, /mock-gateway/authorize, /payments/:id/receipt` |
| evidence | Encrypted vault, judge lock | `/cases/:id/vault, /cases/:id/evidence, /judge/cases/:id/evidence/lock` |
| scheduling | Hearings, anti-clash, board, auto-generate, cause lists | `/admin/scheduling/*, /admin/hearings, /admin/cause-lists/publish, /hearings/mine, /judge/hearings, /cause-lists` |
| judge | Outcomes, decisions, allocated cases | `/judge/hearings/:id/outcome, /judge/cases/:id/decide, /judge/cases` |
| summons | Issue/assign/cancel, server console, sealed proofs | `/admin/summons/*, /server/*, /cases/:id/summons, /summons/:id/proof.pdf` |
| chamber | Lawyer chamber silo + intern portal | `/chamber/*`, `/intern/*` |
| reports | Performance stats, export, verify | `/admin/reports/*` |
| security | Escalation alerts, blocked hosts | `/admin/security/*` |
| audit | Append-only writer with event hash (global) | (used by all modules) |
| notifications | In-app list/read + mock email/SMS/push | `/notifications` |
| feedback | Submit and review feedback | `/feedback, /admin/feedback` |
| settings | Policies (fees, slots, sizes, geo-fence, thresholds) | `/settings/public, /admin/settings` |
| virtual-courtroom | Jitsi sessions (JaaS or public), join window, events, moderation | `/admin/virtual-sessions/*, /hearings/:id/virtual-session/*, /sessions/:id/*` |
| storage | Local disk or S3-compatible driver | (internal) |
| integrations | Mock NADRA, Bar Council, mailer | (internal) |
| health | Liveness + DB ping | `/health` |

## 4. Data model and security
- User 1-1 LawyerProfile / InternProfile / ProcessServerProfile / NotificationPreference; LawyerProfile 1-1 ChamberProfile.
- Court 1-n Courtroom; Case -> Court, Courtroom, Judge (User), filedBy (User); Case 1-n CaseParty (-> LawyerProfile), CaseDocument, Evidence, CaseEvent, Hearing, Challan, Summons.
- Hearing -> Courtroom, Judge; 1-1 CauseListEntry (-> CauseList per court/date), 1-1 CourtSession 1-n CourtSessionParticipant.
- Challan 1-n Payment; Summons 1-n SummonsAttempt; ChamberProfile -> ChamberClient -> BillableEntry, RetainerTransaction; ChamberExpense, ChamberAlertLog.
- InternDiaryEntry (research logs), Attendance; AuditLog, SecurityEvent, SecurityAlert, BlockedHost, GeneratedReport, Feedback, Notification, SystemSetting, FeeStructure, CaseCounter.
- Security: JWT in httpOnly cookie (SameSite=Lax, Secure in prod) or Bearer; global JWT + role guards (RBAC); DTO validation; global throttling (100/min) with stricter auth/upload limits; helmet; AuditLog append-only DB trigger + SHA-256 event hash; AES-256-GCM for evidence and summons photos/signatures; HMAC-SHA256 seals for summons proofs and reports; privilege-escalation alerts with session invalidation and host blacklist; geo-fenced attendance and GPS accuracy checks; reset tokens hashed; card data never stored; 404 for non-owners and malformed ids.

## 5. Business rules and exact messages
Implemented (found in code):
- UCN `DA-YYYY-(CIV|CRA|WRT|BAL)-000001`, atomic counter; challan `CH-YYYY-000001`; receipt `RCPT-YYYY-000001`; client `CL-000001`; chamber `CH-123456`; reports `RPT-YYYY-000001`.
- Mock gateway: 4242.../5555... approved, 4000 0000 0000 0002 declined, others "Payment Unsuccessful: Gateway rejected request details."
- PDF only, 25 MB (policy), max 10 files, magic-byte check; CNIC, phone, PKR, DD-MM-YYYY formats.
- Slots: working days only, 09:00-14:00 × 30 min (policy), no past slots; judge/courtroom unique per slot (partial unique indexes), lawyer clash in app; "Clear/Valid", "Schedule overlap resolved manually.", "Roster details not yet published. Check back later."
- Virtual room opens 15 min before and closes 60 min after the slot; "Court Session Lobby is currently locked by the Admin Bench."; "The virtual courtroom for your hearing is open."
- "Attendance logged successfully. Location verified.", "Privilege escalation neutralized. Host blocked.", "Invalid username or password.", "Case registration is currently closed.", "Only PDF format files under 25MB are allowed."
Different or missing:
- Brief says a lawyer/judge must never be double-booked **on the same day**; code blocks the same **slot** only (several hearings per day allowed). Not flagged as a deviation in CHANGES.
- Per-role login failure messages replaced by one generic message (logged).
- Admin hardware-token MFA: missing (logged).

## 6. Deviations (from CHANGES.md, condensed)
- Prisma, Vite + shadcn, Expo planned; NADRA, Bar Council, payment, email/SMS/push are mocks.
- Self-registration only for litigant/lawyer; staff provisioned by admin (lawyers create interns) via one-time links.
- New statuses/fields: PENDING_ASSIGNMENT, user status actions, soft delete; HELD shown as "Completed".
- Random allocation = fewest active cases, random tie-break; allocation requires a paid challan.
- Fee formula (base + ad valorem for civil suits, modifier); one active challan per case.
- Evidence categories and mock screening (magic bytes) instead of antivirus.
- Notifications in-app with polling (60 s, 5 s in the courtroom) count as "real time".
- Research logs replaced the daily diary; geo-fence via browser GPS (spoofable, accepted).
- Summons workflow, privacy (filers never see server identity/coords), web console instead of native app for now.
- Judge outcome/decision rules, decided cases immutable, open summons cancelled on decision.
- Audit metadata sanitizer; escalation threshold 3 in 10 min; loopback never blocked.
- Report disposal-rate definition, 50,000-row export cap.
- Virtual courtroom: Hearing.isVirtual alongside unused `type`; one session per hearing; per-participant mute by the target's own client (no `muteEveryone`); READMIT command; moderation only with JaaS.
- Deployment: migrations in the Render build (free plan), DIRECT_URL via prisma.config.ts, FRONTEND_URL, TRUST_PROXY=2, S3 driver, seed:demo guard.
Noticed in code, not in CHANGES:
- Anti-clash is per slot, not per day (see 5).
- Judge "Orders" and intern "Certificate" sidebar items are stubs.
- Judge dashboard panels are static placeholders.
- `ProcessServerPage` ("use the mobile app") in `dashboards/index.tsx` is unused since the web console replaced it.
- No Phase 4D section exists (numbering jumps from 4C to 4E).

## 7. Not implemented or partial
- Expo process-server app: not started (`mobile/README.md` only); the web console covers the flow.
- QR biometric bridge: not started (brief: last priority).
- Intern completion certificate: stub.
- Judge Orders page and dashboard panels: stub (decisions work from the case page).
- Admin MFA / hardware token: not built.
- Real NADRA, Bar Council, payment gateway, email/SMS: mocks only (by design).
- Virtual courtroom moderation on public Jitsi: disabled without JaaS keys.
- Automated tests for core flows required by CLAUDE.md (allocation, anti-clash, payments, audit log, summons, virtual courtroom): missing; only auth, users and filing have e2e tests.
- Deployment: prepared, not executed.

## 8. Known issues and risks
- No TODO/FIXME comments in the code (the only "XXX" hits are the phone format).
- No automated UI coverage for phases 3A-4F. Phase 4F screens (control workspace, room view, join buttons) were only API-tested when built, never in a browser with a real Jitsi call; check camera/mic, iframe load and the self-mute behaviour.
- Deployment files (render.yaml, vercel.json, S3 driver) were never run against Render, Vercel, Neon or a real bucket.
- External/env dependencies: JaaS keys (moderation), public meet.jit.si limits embedded meetings; S3 credentials (prod files); Neon pooled + direct URLs; 4 secrets that must never change (`EVIDENCE_ENCRYPTION_KEY`, seal secrets, JWT).
- Security: browser GPS can be spoofed; TRUST_PROXY must match the real proxy chain or the blacklist could block Vercel's address; blocked-host cache is in-memory (single instance only); throttling is in-memory (per instance).
- Performance: notification/attendee polling; the virtual status endpoint is called once per virtual row; report export capped at 50,000 rows; Render free plan sleeps (~1 min cold start).
- Vercel rewrite limits for large uploads (25 MB PDFs, evidence) are untested.
- Server-local time is used for slots and the virtual window; the Render server runs in UTC, so times will be off by 5 hours unless `TZ=Asia/Karachi` is set (not in render.yaml).

## 9. Deployment status
Prepared: `render.yaml` (build runs `prisma migrate deploy`, start `node dist/main`, health `/api/health`), `frontend/vercel.json` (`/api` rewrite + SPA fallback), relative `/api` base URL + Vite proxy, S3-compatible storage driver, fail-fast env validation, `npm run seed:demo` with `DEMO_PASSWORD`, `.env.example` updates, `docs/DEPLOYMENT.md`.
You still do by hand: create Neon (pooled + direct URLs), R2/Supabase bucket and keys, generate 4 secrets; create the Render Blueprint and fill env values; set the Render URL in `vercel.json`; import into Vercel (root `frontend`); set `FRONTEND_URL`; add `TZ=Asia/Karachi` on Render; run `seed:demo` with `.env.production`; run the smoke-test checklist; take backups.

## 10. Suggested order of remaining work
1. Add `TZ=Asia/Karachi` to render.yaml, then deploy following DEPLOYMENT.md and run the smoke test.
2. Browser test of the virtual courtroom with two accounts (and JaaS keys if available).
3. Decide on anti-clash "same day vs same slot" and log it (or change the rule).
4. Core-flow tests: allocation, anti-clash, payments, audit trigger, summons seal.
5. Fill the stubs: judge Orders page and dashboard panels, intern certificate (PDF).
6. Expo process-server app (reuses `/server/*` with Bearer token).
7. Remove dead code (`ProcessServerPage`), final UI/accessibility pass.
8. Defense prep: demo script, seed:demo on the morning, backups.

Estimate: backend ~90%, frontend ~85%, whole project ~75%. Almost every web use case works end to end. The missing part is the Expo app, a few stubs, thin automated tests and a deployment that has never been run.
