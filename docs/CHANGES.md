# Change Log

Running log of decisions and deviations from the project report. Maintained for the teammate who owns the report. Add newest entries at the bottom.

| # | Date | Area | Change |
|---|---|---|---|
| 1 | 03-10-2026 | Backend | ORM = Prisma (with PostgreSQL). |
| 2 | 03-10-2026 | Frontend | Vite + TypeScript + shadcn/ui. |
| 3 | 03-10-2026 | Mobile | Expo (React Native). |
| 4 | 03-10-2026 | Integrations | NADRA verification, payment gateway and SMS are mocks. |
| 5 | 03-10-2026 | Virtual courtroom | Implemented via Jitsi embed (last priority). |
| 6 | 03-10-2026 | Design | Added a design system (`design-system/digitaladaalat/MASTER.md`) and the UI UX Pro Max skill (project scope, `.claude/skills/ui-ux-pro-max`). |

| 7 | 03-10-2026 | Backend | Auth: JWT in an httpOnly, SameSite=Lax cookie (Secure in production), and `Authorization: Bearer` is also accepted. Mobile clients send `X-Client: mobile` on login to receive the token in the response body. |
| 8 | 03-10-2026 | Backend | Login identifier is the email, or the username for admin accounts. Failure always says "Invalid username or password." |
| 9 | 03-10-2026 | Backend | Public self-registration is LITIGANT and LAWYER only. A LAWYER's `LawyerProfile` starts as PENDING until an admin verifies it. INTERN, PROCESS_SERVER, JUDGE and ADMIN accounts are provisioned by an admin (seeded for now). |
| 10 | 03-10-2026 | Backend | NADRA CNIC verification is a mock (`MockNadraService`): checks the CNIC format; numbers starting with 00000 simulate "not found". Email/SMS is a mock that logs to the console. |
| 11 | 03-10-2026 | Database | `AuditLog` is append-only at database level: a PostgreSQL trigger rejects UPDATE and DELETE (custom migration `audit_log_append_only`). Test cleanup uses TRUNCATE. |
| 12 | 03-10-2026 | Database | All money fields are `Decimal(12,2)` (PKR). A chamber client's retainer balance is derived from `RetainerTransaction` rows, not stored. |
| 13 | 03-10-2026 | Database | Judge anti-clash: unique `(judgeId, date, timeSlot)` on `Hearing`. Lawyer double-booking is checked in the application layer through `CaseParty.lawyerId`, backed by an index. |
| 14 | 03-10-2026 | Backend | Password reset: random token, only its SHA-256 hash is stored, 1 hour expiry, single use, only the newest link works. The reset response is identical for known and unknown emails. |
| 15 | 03-10-2026 | Backend | Rate limiting: 100 requests/minute per client overall. Superseded for credential endpoints by entry 19. |
| 19 | 03-10-2026 | Backend | Rate limits revised: register, login and reset password allow 30 requests/minute per IP (`AUTH_THROTTLE_LIMIT`, was 10) so users behind a shared court network are not locked out. Forgot password stays at 10/minute (`FORGOT_THROTTLE_LIMIT`) because it sends email. |
| 16 | 03-10-2026 | Frontend | Added the Process Server information page (summons are served through the mobile app, not the website) and per-role "Coming in a later phase" pages for every sidebar item. |
| 17 | 03-10-2026 | Frontend | Fonts self-hosted through Fontsource (Merriweather, Inter, JetBrains Mono, Noto Nastaliq Urdu) instead of Google Fonts, so the portal works offline and sends no data to third parties. |
| 18 | 03-10-2026 | Tooling | Removed the unused design skills installed with UI UX Pro Max (brand, design, design-system, slides, banner-design, ui-styling). Only `ui-ux-pro-max` remains. |
| 20 | 04-10-2026 | Tooling | The UI UX Pro Max skill is no longer committed: `.claude/skills/` is git-ignored and each developer installs it locally (optional). The design source of truth is `design-system/digitaladaalat/MASTER.md`; the skill is used only for checklist, accessibility and layout guidance. |

## Library versions (chosen 03-10-2026)
Backend: NestJS 12.1.2 (`@nestjs/common`, `core`, `platform-express`, `testing`), `@nestjs/config` 12.0.1, `@nestjs/jwt` 12.0.2, `@nestjs/passport` 12.0.0, `@nestjs/swagger` 12.0.2, `@nestjs/throttler` 6.7.1, Prisma 7.10.0 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`), `pg` 8, passport 0.7.0, passport-jwt 4.0.1, bcrypt 6.0.0, class-validator 0.15.1, class-transformer 0.5.1, helmet 8.3.0, cookie-parser 1.4.7, Jest 30.5.2, ts-jest 29.4.14, Supertest 7.3.1, TypeScript 6.0.3, ESLint 10.12.0, Prettier 3.9.9.
Frontend: React 19.3.0, Vite 8.3.2, Vitest 5.0.3, Tailwind CSS 4.3.3, React Router 8.4.0, TanStack Query 5.104.1, React Hook Form 7.89.0, Zod 4.6.5, `@hookform/resolvers` 5.9.1, Axios 1.20.0, Radix UI (dialog 1.1.23, select 2.3.7, slot 1.3.3, label 2.1.15), Sonner 2.0.8, lucide-react 1.51.0, Testing Library (react 16.3.3, user-event 14.6.7, jest-dom 7.0.1), jsdom 30.1.1, TypeScript 6.0.3.
Runtime: PostgreSQL 17.11, Node.js 24.19.

Version notes:
- Prisma 7.10.0 was chosen over the npm `latest` tag (8.0.0-rc.19), which is a release candidate. Prisma 7 needs a driver adapter (`@prisma/adapter-pg`) and `prisma.config.ts`; the generated client lives in `backend/src/generated` (git-ignored, created by `prisma generate` on install and build).
- TypeScript 6.0.3 rather than 7: ts-jest, typescript-eslint and `@nestjs/swagger` do not support TypeScript 7 yet.
- NestJS 12 packages are ES modules. The backend compiles to CommonJS and relies on Node's `require(esm)` support (Node 20.19+, 22.12+ or 24). Jest runs with `--experimental-vm-modules` (set in the npm scripts).
- Tailwind CSS 4 is configured in CSS (`@theme` in `frontend/src/index.css`), not in `tailwind.config.js`.
- `npm audit` reports 4 high-severity findings in the backend, all inside the Prisma CLI's own dev-time dependencies (`deepmerge-ts`, `mysql2`; the project does not use MySQL). The suggested fix downgrades to Prisma 6, so it was not applied. Revisit when Prisma 8 is stable. The frontend has 0 findings.

## Phase 2 decisions: case filing (03-10-2026)
- **New status `PENDING_ASSIGNMENT`:** a freshly filed case has no judge yet, so it starts here (Phase 3 allocation moves it on).
- **New tables:** `CaseEvent` (lifecycle timeline) and `CaseCounter` (one row per year and case type, incremented atomically inside the filing transaction so UCNs never collide). `CaseDocument` gained `sha256` and `originalName`.
- **UCN format:** `DA-<YYYY>-<CIV|CRA|WRT|BAL>-<6 digits>`. The migration rewrote the old sample UCNs to this format and initialised the counters.
- **Upload API:** `POST /cases` is multipart. The form fields travel as JSON in one `data` field; PDFs go in `files`.
- **File rules:** PDF only, 25 MB each, max 10 per request, extension check plus `%PDF-` magic-byte check. Invalid or oversize files return 400 with "Only PDF format files under 25MB are allowed." (not 413). Files are stored under random names (`cases/<caseId>/<uuid>.pdf`) behind a `StorageService` interface (local disk now, swappable later). Documents are never updated or deleted through the API.
- **Registration switch:** setting `case_registration_open` = false returns 403 with code `REGISTRATION_CLOSED` and "Case registration is currently closed."
- **Access:** only LITIGANT and LAWYER can file. A user sees cases they filed, plus (lawyers) cases where they are counsel of a party. Anyone else, and any malformed id, gets 404. Documents cannot be attached to DECIDED/REJECTED/DISMISSED cases (409).
- **Unverified lawyers may file:** verification status is not checked. Decide whether filing should require a VERIFIED lawyer.
- **Wizard prefill:** a litigant's first petitioner is prefilled from their profile; a lawyer's is left blank.
- **Unsaved-changes guard:** covers tab close, reload and in-app link clicks, not the browser Back button.
- **No client-side magic-byte check:** the browser checks extension, MIME and size; the server does the real check.
- **Throttling and env:** new `UPLOAD_THROTTLE_LIMIT` (default 20/min); `UPLOAD_DIR` and `UPLOAD_TMP_DIR` added.
- **Libraries added:** `multer`, `@types/multer` (backend), `@radix-ui/react-tabs` (frontend).
- **Sidebar:** litigant and lawyer menus now start with Dashboard, New Case Submission, My Case Portfolio.
- **Lawyer verification:** done in Phase 3A (see below).
- **Optional Phase 3 hardening:** a database-level lock (trigger) to block updates and deletes on `CaseDocument`; for now the API simply has no update or delete route.
- **Not in Phase 2:** payments/challan, judge allocation, hearings, evidence vault, notifications, admin case views.

## Phase 3A decisions: admin portal and case allocation (04-10-2026)
These are my design decisions where the report is silent or I went beyond it. Recharts and the Radix dropdown menu were added to the frontend.

1. **Case allocation (no report text).** The registrar allocates a case that is `PENDING_ASSIGNMENT` to a court, courtroom and judge, manually or randomly. Re-allocation needs an explicit `reallocate` flag, only works on `ALLOCATED` cases, and records the previous judge in the lifecycle event and the audit log. Allocation sets status `ALLOCATED`, adds a `CASE_ALLOCATED` lifecycle event (visible to the litigant or lawyer) and an in-app notification to whoever filed the case.
2. **Random allocation rule.** Among ACTIVE judges of the chosen court, take those with the fewest active cases and pick one at random among ties. Active cases are those in status FILED, UNDER_SCRUTINY, ALLOCATED, PENDING or HEARING_FIXED. On re-allocation the previous judge is skipped when another judge is available.
3. **Courtroom default.** If no courtroom is given: the judge's own courtroom (new optional `User.courtroomId`), else the first active courtroom of the court.
4. **New statuses and fields.** `UserStatus.BLOCKED` (access revoked); the existing `DEACTIVATED` is the soft-deleted state; `CaseEventType.CASE_ALLOCATED`; `User.courtroomId`. The existing `ALLOCATED` and `DECIDED` case statuses are reused. Migration `admin_allocation`.
5. **Account actions.** Suspend, block (revoke access), reactivate and delete (soft delete, rows are never removed because of foreign keys). An admin cannot suspend, block or delete themselves or the last active admin. A deleted account cannot be changed. Reactivating a rejected lawyer moves the profile back to PENDING. There is no role-change endpoint.
6. **Provisioning staff.** Admin creates INTERN, PROCESS_SERVER, JUDGE and ADMIN accounts. The account gets a random unusable password and a password-reset link (valid 72 hours, same token mechanism as forgot-password). The email is mocked (logged to the console) and the link is returned once to the admin. Public registration stays LITIGANT and LAWYER only. An intern account has no `InternProfile` yet, because it needs a supervising lawyer; that is created in the internship phase.
7. **Mock Bar Council.** A bar number matching `^[A-Z]{2}-\d{4,6}$` is "found", a small hard-coded list (`LH-99999`, `LH-00000`, `PB-123456`) is "not found". Seeded older lawyers with numbers like `MBA-2016-0101` are already VERIFIED and are not re-checked.
8. **Verified-lawyer filing rule.** A LAWYER whose profile is not VERIFIED gets 403 with "Your lawyer profile is pending verification. You can file cases once the registrar approves your bar credentials." on `POST /cases` and when attaching documents. Once verified, credentials are locked (it cannot be verified or rejected again; suspend the account instead). Rejecting sets the profile REJECTED, stores the reason and suspends the account.
9. **Policies.** Settings: `max_attachment_mb` (1 to 100, default 25), `case_registration_open`, `filing_fee_rate_modifier` (decimal percent 0 to 100), plus editable filing fees per case type in `FeeStructure`. The older seeded key `max_pleading_size_mb` is no longer read. The multer hard cap is 100 MB; the policy limit is checked afterwards and the rejection message shows the active limit. `GET /settings/public` exposes only `maxAttachmentMb` and `caseRegistrationOpen`. The fee modifier is stored and shown but not applied anywhere yet, because challans and payments are a later phase.
10. **Analytics.** "Active trial numbers" are shown as active (allocated) cases, "pending document loads" as documents attached in the last 7 days, "daily clearing rate" as cases decided per day (from `Case.decidedAt`, which nothing sets yet except the seed), and "server processing load" as uptime, database ping and memory. The court filter applies to case and document metrics; pending-assignment cases that have no court are excluded when a court is chosen.
11. **Notifications.** In-app only, polled every 60 seconds. Lawyer verification also notifies the lawyer.
12. **Lawyer and litigant UI.** The "New Case Submission" button is disabled with an explanation for unverified lawyers and when registration is closed; the wizard's file check uses the active size limit.

### Phase 3B (next, not built)
Hearings, cause lists, anti-clash scheduling, calendar overlaps, the hearing schedule for litigants and lawyers, and the partial unique index that ignores cancelled hearings (see below).

## Workflow change (04-10-2026)
All work is now committed directly to `main` (no personal branch, no pull requests). Rules: small logical commits; `npm run build` and `npm run lint` in backend and frontend before every push; `git pull origin main` before pushing and merge carefully if the teammate pushed; never force push. The `danish` branch stays as a backup and is not deleted.

## Phase 3B cleanup decisions (04-10-2026)
- The stale setting key `max_pleading_size_mb` was removed from the seed, and the seed deletes its row (the policy is `max_attachment_mb`).
- A rejected lawyer who is reactivated returns to PENDING (already implemented in Phase 3A).
- Provisioned interns get their InternProfile and supervisor in the internship phase.

## Phase 3B decisions: hearings, cause lists, anti-clash scheduling (04-10-2026)
My design where the report is silent or I added to it.

1. **Slots and working days.** Policy settings `court_day_start` (09:00), `court_day_end` (14:00) and `hearing_slot_minutes` (30), editable on System Policies and validated (court hours must fit whole slots). Courts sit Monday to Friday; a hearing needs a working day, today or later, and a real slot. The three settings cannot be changed while upcoming non-cancelled hearings exist (the slot number is the stored key, so changing the slot length would silently re-time them).
2. **Clash rules.** For a candidate (judge, courtroom, all lawyers of the case, date, slot): the judge, the courtroom or any lawyer attached through `CaseParty.lawyerId` has another non-cancelled hearing in that date and slot (any case, any court). The report's wording is used for the lawyer clash: "Scheduling Conflict: Lawyer has a matching court appearance time in <courtroom>." (the courtroom of the clashing hearing). My own wording: "Scheduling Conflict: Judge has a matching hearing at the same time in <courtroom>." and "Scheduling Conflict: <courtroom> is already booked for this time slot." (courtroom names are shown as in the data, for example "Court Room 1" or "Bench I", so there is no extra word "Courtroom" in front). Success: "Anti-clash verification successful: No schedule conflicts detected." and the label "Clear/Valid".
3. **Database safety net.** The unique constraint on `(judgeId, date, timeSlot)` was replaced by two partial unique indexes ignoring cancelled hearings: `Hearing_judge_slot_active_key` on `(judgeId, date, timeSlot) WHERE status <> 'CANCELLED'` and `Hearing_courtroom_slot_active_key` on `(courtroomId, date, timeSlot) WHERE status <> 'CANCELLED' AND courtroomId IS NOT NULL`. They are written by hand in the `hearing_scheduling` migration (created with `--create-only`). Prisma cannot model partial indexes and ignores them when it compares the schema with the database, so `prisma migrate dev` reports no drift; the schema keeps a plain `@@index([judgeId, date, timeSlot])` for lookups. A unique-violation error (P2002) is mapped to the same 409 conflict response. Lawyer clashes cannot be expressed as an index, so every scheduling write runs in one transaction that first takes `pg_advisory_xact_lock` on the date (two locks, in sorted order, when a hearing moves between dates).
4. **Hearing status.** The existing enum is used: SCHEDULED, HELD (completed), ADJOURNED, CANCELLED. Only SCHEDULED and ADJOURNED hearings can be rescheduled or cancelled. A case becomes `HEARING_FIXED` when it gets a hearing and returns to `ALLOCATED` when its last upcoming hearing is cancelled. New `CaseEventType` values: `HEARING_SCHEDULED`, `HEARING_RESCHEDULED`, `HEARING_CANCELLED` (shown in the Lifecycle tab). No case event is written for cause-list publication, because a cause list belongs to a court and a day, not to one case.
5. **Conflicts are computed on read.** The board and the run-check scan compute conflicts from the data, nothing is stored, so a flag clears by itself when the overlap is resolved. In practice only lawyer clashes can exist, because the indexes block judge and courtroom clashes.
6. **Reschedule messages.** "Schedule overlap resolved manually." when `resolveConflict` is true (the board sends it for a flagged hearing), otherwise "Hearing rescheduled successfully." (my wording). Hearings scheduled: "Hearing scheduled successfully."; cancelled: "Hearing cancelled."; publish blocked: "Resolve all scheduling conflicts before publishing."; empty schedule: "No upcoming hearings have been scheduled for your cases yet."
7. **Cause lists.** Publishing builds entries ordered by courtroom name, then slot time, with serial numbers, and notifies everyone with a hearing that day (litigants, lawyers and the judge) once. A published list is rebuilt automatically when a hearing on that date is created, moved or cancelled; those people are notified by the hearing action itself (so nobody gets two notices). A draft or missing list is not rebuilt. Anyone signed in can read published lists; unpublished dates answer "Roster details not yet published. Check back later." `isMine` means the user filed the case, is counsel on it, or is the judge.
8. **Vacancy mapping and auto-generate.** Free slots are those where the judge, a courtroom of the court and all lawyers of the case are free, for the next 14 working days (a moved hearing's own slot counts as free). Auto-generate places the chosen allocated cases first-fit into one day, using each case's judge (his own courtroom first), skipping cases that already have an upcoming hearing, in one transaction. Slots earlier in the day than the current time are still offered for today.
9. **Notifications (FR 4-3).** Schedule, change, cancellation and publication notices use the existing in-app notifications and bell (60 second polling counts as real time); each links to the hearing schedule or the cause lists.
10. **Demo data.** The seed adds the three settings, extra allocated cases for every judge, hearings on the working days after today, a published cause list for the next working day and a draft for the day after, and one deliberate lawyer clash inserted directly into the database (Hamid Nawaz vs. The State and Salman Khan vs. The State share a lawyer in the same slot) so the board shows a red conflict. The two older sample hearings were replaced by hearings on working days.

### Phase 4 (next, not built)
Challans and payments, evidence vault, summons and the process-server app, lawyer chamber, internship, reports, audit-log screens, virtual courtroom, and judge decisions that set `decidedAt` (which also feeds the "decided per day" chart).

## Phase 4A step 0: Phase 3B follow-ups (05-10-2026)
- Accepted decisions: conflict messages use the courtroom name exactly as stored; court hours and slot length cannot be edited while upcoming hearings exist.
- Slots that have already started today are not offered in the UI and are refused by the server with 409 "Cannot schedule a hearing in a time slot that has already passed." (server local time; a slot counts as passed once its start time is reached). Vacancy mapping and the board also skip them.

## Planned changes (not done yet)
- **Phase 3, hearing slots:** done in Phase 3B (partial unique indexes, see above).

## Open issues for the report
- Methodology conflict: Chapter 1.6 says Agile/Scrum, while Chapter 3.3 says Iterative/Incremental. One must be chosen and both chapters made consistent.

## Report issues for my teammate
Found while comparing the report with the project scope. Fix in the report; none of these change the code.

1. Section 1.7 says the report has 6 chapters, but the template has 8.
2. Methodology: Section 1.6 says Agile/Scrum, Section 3.3 says Iterative/Incremental. Recommendation: choose Agile/Scrum and update 3.3 (see also the open issue above).
3. Section 3.2.1 contains a leftover "Store Side" heading from another project.
4. Functional requirement numbering in 3.2.1 (FR 1-15) differs from the traceability matrix (FR 01-46).
5. Table numbers jump from 3.15 to 3.24, and Table 3.78 is missing.
6. Use case IDs such as UC-1.1 repeat across portals; make them unique.
7. Judge and Mock NADRA are actors in 3.1 but are missing from the use case diagram.
8. Intern use cases in the diagram differ from the textual use cases.
9. Objectives mention the biometric QR bridge, random judge allocation and Digital Malkhana without matching functional requirements.
10. "2.5 Relevance to Your Project" is still template wording.
11. Chapter 2 has no APA citations.
12. A heading reads "FR 6" where it should read "NFR 6: Compatibility".
