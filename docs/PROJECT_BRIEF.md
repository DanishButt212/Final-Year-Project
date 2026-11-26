# DigitalAdaalat: Project Brief

## Purpose
DigitalAdaalat is a web-based Judicial ERP for Pakistan's court system. It digitizes the court case lifecycle: electronic filing, random judge allocation, cause list scheduling, hearings, hearing transcripts, summons and document delivery, lawyer chamber management with hearing coverage, legal intern tracking and reports.

## Roles
| Role | Description |
|---|---|
| LITIGANT | Party to a case |
| LAWYER | Chamber owner |
| INTERN | Legal apprentice |
| PROCESS_SERVER | Tamila officer, uses the mobile app |
| STENOGRAPHER | Writes hearing transcripts for the judge to review and sign |
| JUDGE | Hears cases, issues orders, signs transcripts, decides absence fines |
| ADMIN | Shown as "Reader": court official who runs the registry, bench scheduling and reviews |

## Portals
- **User Portal (litigant/lawyer):** register/login; verified lawyers file a case for the represented litigant with a multi-step form (litigants do not self-file); upload PDF pleadings; automatic Unique Case Number (UCN); fixed filing fee by case type with the challan issued at filing; view hearings and the daily cause list; mock payment by card, JazzCash, Easypaisa or bank transfer; receipt; evidence vault; signed hearing transcripts (lawyers); notification settings; feedback.
- **Lawyer Chamber Portal:** clients, billable hours, retainer balance, expenses, intern review, chamber members; hearing clashes with substitute lawyers (private nomination or chamber allocation at the Chamber Portal).
- **Legal Intern Portal:** daily diary, geo-fenced attendance, completion certificate.
- **Process Server mobile app:** pending summons, GPS location, delivery photo, recipient signature; document deliveries with attempt reports.
- **Stenographer Portal:** assigned hearings; write, save and submit transcripts; correct returned ones.
- **Judge Portal:** cause list, case status, orders; review, approve and digitally sign transcripts; approve or reject substitute lawyers; record lawyer absences and decide fines; forwarded delivery reports.
- **Admin Portal:** analytics dashboard, user management, lawyer verification, case allocation, cause list builder, anti-clash scheduling, stenographer assignments, document delivery review, hearing clash review and last-summons marking, absence fine amounts, immutable audit logs, PDF/Excel reports, system settings.

## Key rules
- A lawyer or judge must never be double-booked on the same day (anti-clash). An approved substitute lawyer counts as booked for that slot.
- A last-summons hearing allows no substitution; the Reader fixes a new date.
- Pleadings: PDF only, maximum 25 MB.
- CNIC format: `12345-1234567-1`.
- Phone format: `+92 3XX XXXXXXX`.
- Currency: PKR.
- Dates: `DD-MM-YYYY`.
- The audit log is append-only.

## Scope decisions
- Mocked external systems: NADRA CNIC verification, payment gateway, email/SMS, Bar Council verification.
- No virtual hearings: the virtual courtroom was removed on 16-11-2026 and all hearings are held in person (see `docs/CHANGES.md`, Workflow update).
- Out of scope: blockchain, AI judgment writing.
- Last priority: QR biometric bridge.

## Tech stack
Monorepo:
- `/backend`: NestJS + TypeScript, Prisma, PostgreSQL, JWT, bcrypt, class-validator, Swagger, Jest.
- `/frontend`: React + Vite + TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, Axios.
- `/mobile`: React Native with Expo (later).
- `/docs`: documentation.
