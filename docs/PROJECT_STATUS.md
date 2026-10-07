# DigitalAdaalat: Project Status (audit of main, 07-10-2026, updated after Phase 5B)

Read-only audit of the code on `main`. Nothing was built, tested or run for this report. The full project report is not in the repo, so section 5 checks the rules in `docs/PROJECT_BRIEF.md`, `docs/CHANGES.md` and the exact strings in the code.

## 1. Overview
| Item | Value |
|---|---|
| Stack | NestJS 12 + Prisma 7 + PostgreSQL; React 19 + Vite 8 + TS, Tailwind 4, shadcn/ui, TanStack Query, RHF + Zod |
| Prisma | 41 models, 35 enums, 12 migrations (3 hand-written: audit trigger, partial unique indexes, 4F) |
| Backend | 22 Nest modules (17 feature + app, prisma, health, settings, integrations), 16 controller files, 161 route handlers |
| Frontend | 72 page/component files under `pages/`, 61 routes, 6 role portals |
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
- Interns: create intern accounts, change status, review research logs, issue the completion certificate: C
- Chamber desk login (Chamber ID + email + password): C

**INTERN**
- Dashboard, research logs (create, edit until approved): C
- Geo-fenced attendance check-in/out (browser GPS, radius per court): C
- Completion certificate: C (view, download PDF `CERT-YYYY-000001`, verify HMAC seal)

**PROCESS_SERVER**
- Mobile-first web console: duty roster, summons detail, attempts with GPS, finalize with photo + signature (HMAC sealed), profile: C
- Native Expo app: S (`mobile/` holds only a README)

**JUDGE**
- My Schedule (week view), Daily Cause Lists, My Allocated Cases, read-only case detail: C
- Record hearing outcome (completed/adjourned), decide a case (final, immutable), lock evidence: C
- Join virtual hearing from My Schedule: C (only API-tested)
- Orders page (hearing orders and final decisions, search, outcome filter, link to case): C
- Dashboard "Today's cause list" (with Join for open virtual rooms) and "Recent orders" (last 5): C

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
| judge | Outcomes, decisions, allocated cases, orders list | `/judge/hearings/:id/outcome, /judge/cases/:id/decide, /judge/cases, /judge/orders` |
| summons | Issue/assign/cancel, server console, sealed proofs | `/admin/summons/*, /server/*, /cases/:id/summons, /summons/:id/proof.pdf` |
| chamber | Lawyer chamber silo, intern portal, completion certificates | `/chamber/*` (incl. `/chamber/interns/:id/certificate`), `/intern/*` (incl. `/intern/certificate`) |
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
- InternDiaryEntry (research logs), Attendance, InternCertificate (1-1 InternProfile); AuditLog, SecurityEvent, SecurityAlert, BlockedHost, GeneratedReport, Feedback, Notification, SystemSetting, FeeStructure, CaseCounter.
- Security: JWT in httpOnly cookie (SameSite=Lax, Secure in prod) or Bearer; global JWT + role guards (RBAC); DTO validation; global throttling (100/min) with stricter auth/upload limits; helmet; AuditLog append-only DB trigger + SHA-256 event hash; AES-256-GCM for evidence and summons photos/signatures; HMAC-SHA256 seals for summons proofs, reports and intern certificates; privilege-escalation alerts with session invalidation and host blacklist; geo-fenced attendance and GPS accuracy checks; reset tokens hashed; card data never stored; 404 for non-owners and malformed ids.

## 5. Business rules and exact messages
Implemented (found in code):
- UCN `DA-YYYY-(CIV|CRA|WRT|BAL)-000001`, atomic counter; challan `CH-YYYY-000001`; receipt `RCPT-YYYY-000001`; client `CL-000001`; chamber `CH-123456`; reports `RPT-YYYY-000001`; certificates `CERT-YYYY-000001`.
- Mock gateway: 4242.../5555... approved, 4000 0000 0000 0002 declined, others "Payment Unsuccessful: Gateway rejected request details."
- PDF only, 25 MB (policy), max 10 files, magic-byte check; CNIC, phone, PKR, DD-MM-YYYY formats.
- Slots (always Pakistan time, independent of the server zone): working days only, 09:00-14:00 × 30 min (policy), no past slots; judge/courtroom unique per slot (partial unique indexes), lawyer clash in app; "Clear/Valid", "Schedule overlap resolved manually.", "Roster details not yet published. Check back later."
- Virtual room opens 15 min before and closes 60 min after the slot; "Court Session Lobby is currently locked by the Admin Bench."; "The virtual courtroom for your hearing is open."
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
- Notifications in-app with polling (60 s, 5 s in the courtroom) count as "real time".
- Research logs replaced the daily diary; geo-fence via browser GPS (spoofable, accepted).
- Summons workflow, privacy (filers never see server identity/coords), web console instead of native app for now.
- Judge outcome/decision rules, decided cases immutable, open summons cancelled on decision.
- Audit metadata sanitizer; escalation threshold 3 in 10 min; loopback never blocked.
- Report disposal-rate definition, 50,000-row export cap.
- Virtual courtroom: Hearing.isVirtual alongside unused `type`; one session per hearing; per-participant mute by the target's own client (no `muteEveryone`); READMIT command; moderation only with JaaS.
- Deployment: migrations in the Render build (free plan), DIRECT_URL via prisma.config.ts, FRONTEND_URL, TRUST_PROXY=2, S3 driver, seed:demo guard.
- Phase 5B: Pakistan time computed explicitly (TZ only a safety net, warning not failure); anti-clash per slot; certificate rules (one per intern, needs an approved log, seal keyed with REPORT_SEAL_SECRET, verify only for lawyer and intern).

Noticed in code, not in CHANGES: none left after Phase 5B (the per-slot rule, the stubs, the unused `ProcessServerPage` and the missing Phase 4D note were all addressed).

## 7. Not implemented or partial
- Expo process-server app: not started (`mobile/README.md` only); the web console covers the flow.
- QR biometric bridge: not started (brief: last priority).
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
- Server clock: fixed in Phase 5B (Pakistan time computed explicitly; `TZ=Asia/Karachi` in render.yaml with a startup warning).
- Phase 5B screens (judge Orders, dashboard panels, certificate issue/download/verify) were type-checked but not opened in a browser yet.

## 9. Deployment status
Prepared: `render.yaml` (`TZ=Asia/Karachi`, build runs `prisma migrate deploy`, start `node dist/main`, health `/api/health`), `frontend/vercel.json` (`/api` rewrite + SPA fallback), relative `/api` base URL + Vite proxy, S3-compatible storage driver, fail-fast env validation, `npm run seed:demo` with `DEMO_PASSWORD`, `.env.example` updates, `docs/DEPLOYMENT.md`.
You still do by hand: create Neon (pooled + direct URLs), R2/Supabase bucket and keys, generate 4 secrets; create the Render Blueprint and fill env values; set the Render URL in `vercel.json`; import into Vercel (root `frontend`); set `FRONTEND_URL` (`TZ` is already in the Blueprint); run `seed:demo` with `.env.production`; run the smoke-test checklist; take backups.

## 10. Suggested order of remaining work
1. Deploy following DEPLOYMENT.md and run the smoke test (Neon, bucket, Render, Vercel).
2. Browser pass over 4F and 5B screens: virtual courtroom with two accounts (JaaS if available), judge Orders and dashboard, certificate issue and PDF.
3. Core-flow tests: allocation, anti-clash, payments, audit trigger, summons seal, certificate seal.
4. Expo process-server app (reuses `/server/*` with Bearer token).
5. Final UI and accessibility pass.
6. Defense prep: demo script, seed:demo on the morning, backups.

Estimate: backend ~93%, frontend ~90%, whole project ~80%. Every web use case in the brief now has a working screen. What remains is the Expo app, automated tests for the core flows, a browser pass over the newest screens and the first real deployment.
