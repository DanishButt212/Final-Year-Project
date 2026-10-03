# DigitalAdaalat: Claude Code instructions

## Project summary
DigitalAdaalat is a web-based Judicial ERP for Pakistan's court system (final year project). It covers e-filing, random judge allocation, cause lists, hearings, summons delivery, lawyer chambers, legal interns and reports. Full details: `docs/PROJECT_BRIEF.md`.

## Stack
- Backend: NestJS + TypeScript, Prisma, PostgreSQL, JWT, bcrypt, class-validator, Swagger, Jest.
- Frontend: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, Axios.
- Mobile: React Native with Expo (later).

## Folder structure
```
backend/        NestJS API
frontend/       React web portals
mobile/         Expo process-server app
docs/           PROJECT_BRIEF.md, CHANGES.md
design-system/  digitaladaalat/MASTER.md
.claude/        Claude Code config and skills (committed)
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

Our tokens in `MASTER.md` are the final authority. Use the UI UX Pro Max skill (`.claude/skills/ui-ux-pro-max`) only for checklist, accessibility, layout and dashboard/chart guidance; never let it override our colors, fonts or anti-patterns.

## Branch workflow
- Personal branches (for example `danish`); never commit or push to `main` directly.
- Changes go into `main` through pull requests, reviewed by Danish.

## References
- Project brief: `docs/PROJECT_BRIEF.md`
- Design system: `design-system/digitaladaalat/MASTER.md`
- Change log: `docs/CHANGES.md`
