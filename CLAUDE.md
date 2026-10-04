# DigitalAdaalat: Claude Code instructions

## Project summary
DigitalAdaalat is a web-based Judicial ERP for Pakistan's court system (final year project). It covers e-filing, random judge allocation, cause lists, hearings, summons delivery, lawyer chambers, legal interns and reports. Full details: `docs/PROJECT_BRIEF.md`.

## Stack
- Backend: NestJS + TypeScript, Prisma, PostgreSQL, JWT, bcrypt, class-validator, Swagger, Jest.
- Frontend: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, Axios.
- Mobile: React Native with Expo (later).

## Status
Phase 1 is done: database schema + migrations + seed, backend auth/users/audit/health, frontend foundation. Phase 2 is done: case filing for litigants and lawyers (multi-step form, PDF upload, auto UCN, portfolio, case detail). Phase 3A is done: the admin portal (analytics board, account management, lawyer verification, system policies, courts and benches, case registry and allocation), in-app notifications and the judge's allocated cases. Phase 3B is done: hearings, cause lists and anti-clash scheduling (admin master board, vacancy mapping, auto-generate, publish; hearing schedule and daily cause lists for litigants, lawyers and judges). Phase 4 is next. Everything else (payments, evidence, summons, chamber, internship, reports, mobile) is planned; the empty backend folders each have a README.

## Commands
- Backend (`backend/`): `npm run start:dev`, `npm test`, `npm run test:e2e` (uses `.env.test` and the `digitaladaalat_test` database), `npm run lint`, `npm run build`, `npx prisma migrate dev --name <change>`, `npm run prisma:seed`.
- Frontend (`frontend/`): `npm run dev`, `npm test`, `npm run lint`, `npm run build`.
- Setup instructions: root `README.md`.

## Technical notes
- NestJS 12 is ES-module only; the backend compiles to CommonJS and relies on Node `require(esm)`; Jest runs with `--experimental-vm-modules` (already in the npm scripts).
- Prisma 7: schema in `backend/prisma/schema.prisma`, connection in `backend/prisma.config.ts`, generated client in `backend/src/generated` (git-ignored; created by `prisma generate`).
- The AuditLog table has a trigger that blocks UPDATE/DELETE. Tests reset data with `TRUNCATE ... CASCADE`.
- All routes require a JWT unless marked `@Public()`; restrict by role with `@Roles(...)`.
- Money is `Decimal` (PKR), never `Float`.
- Never print or commit `.env`, `.env.test` or `docs/DEV_ACCOUNTS.md`.

## Folder structure
```
backend/        NestJS API
frontend/       React web portals
mobile/         Expo process-server app
docs/           PROJECT_BRIEF.md, CHANGES.md
design-system/  digitaladaalat/MASTER.md
.claude/        Claude Code config (skills are local only, git-ignored)
```

## Rules
- Every endpoint validates input with DTOs (class-validator).
- Auth and role guards on every protected endpoint.
- Database changes only through Prisma migrations.
- Write tests for core flows (filing, allocation, anti-clash, payments, audit log).
- No secrets in git. Use `.env.example` for templates.
- Any deviation from the project report is logged in `docs/CHANGES.md`.
- Formats: CNIC `12345-1234567-1`, phone `+92 3XX XXXXXXX`, currency PKR, dates `DD-MM-YYYY`. PDFs only, max 25 MB. Audit log is append-only.

## Theme summary
Official, calm, trustworthy Pakistan court/government portal. Deep green primary (#01411C), muted gold accent (#B8962E, small highlights only), light mode only, Merriweather headings, Inter body, monospace case numbers. No gradients, glassmorphism, dark mode or emojis as icons. Full spec: `design-system/digitaladaalat/MASTER.md`.

Our tokens in `design-system/digitaladaalat/MASTER.md` are the single source of truth for the design. The UI UX Pro Max skill is optional and installed locally per developer (`.claude/skills/` is git-ignored, not committed); use it only for checklist, accessibility and layout guidance, and never let it override our colors, fonts or anti-patterns.

## Git workflow
- Work directly on `main`, in small logical commits.
- Before every push run `npm run build` and `npm run lint` in `backend/` and `frontend/`; both must pass.
- Run `git pull origin main` before pushing; if my teammate pushed something, merge carefully.
- Never force push. The `danish` branch is kept as a backup; do not delete it.

## References
- Project brief: `docs/PROJECT_BRIEF.md`
- Design system: `design-system/digitaladaalat/MASTER.md`
- Change log: `docs/CHANGES.md`
