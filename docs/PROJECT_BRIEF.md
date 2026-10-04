# DigitalAdaalat: Project Brief

## Purpose
DigitalAdaalat is a web-based Judicial ERP for Pakistan's court system. It digitizes the court case lifecycle: electronic filing, random judge allocation, cause list scheduling, hearings, summons delivery, lawyer chamber management, legal intern tracking and reports.

## Roles
| Role | Description |
|---|---|
| LITIGANT | Party to a case |
| LAWYER | Chamber owner |
| INTERN | Legal apprentice |
| PROCESS_SERVER | Tamila officer, uses the mobile app |
| JUDGE | Hears cases and issues orders |
| ADMIN | Registrar / administrator |

## Portals
- **User Portal (litigant/lawyer):** register/login; file a case with a multi-step form; upload PDF pleadings; automatic Unique Case Number (UCN); view hearings and the daily cause list; court fee challan and mock online payment; receipt; evidence vault; notification settings; feedback.
- **Lawyer Chamber Portal:** clients, billable hours, retainer balance, expenses, intern review.
- **Legal Intern Portal:** daily diary, geo-fenced attendance, completion certificate.
- **Process Server mobile app:** pending summons, GPS location, delivery photo, recipient signature.
- **Judge Portal:** cause list, case status, orders.
- **Admin Portal:** analytics dashboard, user management, lawyer verification, case allocation, cause list builder, anti-clash scheduling, virtual courtroom control, immutable audit logs, PDF/Excel reports, system settings.

## Key rules
- A lawyer or judge must never be double-booked on the same day (anti-clash).
- Pleadings: PDF only, maximum 25 MB.
- CNIC format: `12345-1234567-1`.
- Phone format: `+92 3XX XXXXXXX`.
- Currency: PKR.
- Dates: `DD-MM-YYYY`.
- The audit log is append-only.

## Scope decisions
- Mocked external systems: NADRA CNIC verification, payment gateway, email/SMS, Bar Council verification.
- Virtual hearings via Jitsi, later.
- Out of scope: blockchain, AI judgment writing.
- Last priority: QR biometric bridge, virtual courtroom.

## Tech stack
Monorepo:
- `/backend`: NestJS + TypeScript, Prisma, PostgreSQL, JWT, bcrypt, class-validator, Swagger, Jest.
- `/frontend`: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, Axios.
- `/mobile`: React Native with Expo (later).
- `/docs`: documentation.
