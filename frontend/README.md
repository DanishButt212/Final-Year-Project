# Frontend

Web portals for DigitalAdaalat. Runs on http://localhost:5173 and talks to the API at `VITE_API_URL` (default http://localhost:4000/api).

Stack: React 19 + Vite 8 + TypeScript, Tailwind CSS 4, shadcn/ui-style components (Radix UI), React Router, TanStack Query, React Hook Form + Zod, Axios, Vitest + Testing Library. Exact versions are listed in `docs/CHANGES.md`.

Design rules: `design-system/digitaladaalat/MASTER.md` is the final authority. Tokens are defined once in `src/index.css` (`@theme`).

## What exists (Phase 1)
- Public: landing, login, register (Litigant/Lawyer), forgot password, reset password.
- Signed in: shared layout (green header, role-based sidebar, breadcrumbs), profile (view and edit), one dashboard per role (Litigant, Lawyer, Intern, Judge, Admin) with empty states, a Process Server information page, "Coming in a later phase" pages for every sidebar item, 403 and 404 pages.
- Admin dashboard lists users from `GET /api/users` (search, role filter, pagination).
- Reusable components in `src/components/ui`: Button, Input/PasswordInput, Field, Select, Table, Badge, Card, Dialog, Toaster, Skeleton, EmptyState, Pagination, Alert.

## Structure
```
src/auth/         AuthProvider (session via GET /auth/me), route guards
src/components/   ui/ (primitives) and layout/ (shell, header, sidebar, breadcrumbs)
src/lib/          api client, schemas (Zod), role navigation, formatters
src/pages/        route components and dashboards
```

## Commands
```powershell
npm install
npm run dev       # http://localhost:5173
npm test          # Vitest
npm run lint
npm run build
```
