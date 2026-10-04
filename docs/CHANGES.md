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
- **Lawyer verification (Phase 3):** once admin lawyer verification exists, filing a case will require a VERIFIED lawyer.
- **Optional Phase 3 hardening:** a database-level lock (trigger) to block updates and deletes on `CaseDocument`; for now the API simply has no update or delete route.
- **Not in Phase 2:** payments/challan, judge allocation, hearings, evidence vault, notifications, admin case views.

## Planned changes (not done yet)
- **Phase 3, hearing slots:** cancelled hearings must not keep holding a judge's slot. Replace the unique `(judgeId, date, timeSlot)` constraint on `Hearing` with a partial unique index that ignores `CANCELLED` hearings (raw SQL migration, `CREATE UNIQUE INDEX ... WHERE status <> 'CANCELLED'`). Do this when hearing scheduling is built, not before.

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
