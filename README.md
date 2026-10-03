# Final-Year-Project
## Project structure

```
backend/        NestJS API (Prisma, PostgreSQL)
frontend/       React + Vite web portals
mobile/         Expo app for process servers (later)
docs/           Project brief and change log
design-system/  Locked design system (MASTER.md)
CLAUDE.md       Instructions for Claude Code
```

See `docs/PROJECT_BRIEF.md` for the full project brief.

## Branch workflow

- `main` is protected by convention: never commit or push to it directly.
- Each team member works on a personal branch (for example `danish`).
- Changes reach `main` through pull requests, reviewed by Danish.

## Getting started (Windows)

Requirements: Node.js 20.19+ (tested on 24), npm, PostgreSQL 16 or 17 on `localhost:5432` (or Docker Desktop, see below).

### 1. Database
Create two empty databases, `digitaladaalat` (development) and `digitaladaalat_test` (automated tests):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE digitaladaalat;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE digitaladaalat_test;"
```

No local PostgreSQL? `docker compose up -d` starts PostgreSQL 17 and creates both databases (optional alternative; set `POSTGRES_PASSWORD` first).

### 2. Backend (http://localhost:4000/api, Swagger at http://localhost:4000/api/docs)
```powershell
cd backend
npm install
Copy-Item .env.example .env
Copy-Item .env.example .env.test
```
Edit both files: put your PostgreSQL password into `DATABASE_URL` (use the `digitaladaalat_test` database in `.env.test`) and set `JWT_SECRET` to a random value (use a different one per file):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then create the tables and sample data, and start the API:

```powershell
npx prisma migrate deploy      # applies all migrations, including the append-only audit trigger
npm run prisma:seed            # courts, fees, sample cases and one dev account per role
npm run start:dev              # http://localhost:4000/api
```

The seed prints the development passwords once and writes them to `docs/DEV_ACCOUNTS.md` (git-ignored, local only). Re-running the seed generates new passwords.
After changing `prisma/schema.prisma`, create a migration with `npx prisma migrate dev --name <what_changed>`.

### 3. Frontend (http://localhost:5173)
```powershell
cd frontend
npm install
Copy-Item .env.example .env      # optional: only needed if the API is not on localhost:4000
npm run dev
```

### 4. Tests and checks
```powershell
cd backend
npm test            # unit tests
npm run test:e2e    # end-to-end tests against digitaladaalat_test (migrations are applied first)
npm run lint
npm run build

cd ..\frontend
npm test
npm run lint
npm run build
```

Never commit `.env` files or `docs/DEV_ACCOUNTS.md`. They are git-ignored; only `.env.example` files are tracked.
