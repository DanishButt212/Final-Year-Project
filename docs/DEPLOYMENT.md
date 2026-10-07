# Deployment: Neon + Render + Vercel

Database on **Neon** (PostgreSQL), API on **Render** (`render.yaml`), web app on **Vercel** (`frontend/vercel.json`), files in an **S3-compatible bucket** (Cloudflare R2 or Supabase Storage). The browser only ever talks to the Vercel domain: Vercel rewrites `/api/*` to Render, so the auth cookie stays first-party (`SameSite=Lax`, `Secure`).

Never put real values in git. Secrets go into the Render dashboard and, for the one-off demo seed, into `backend/.env.production` on your machine (git-ignored by `.env.*`).

## 0. Generate the secrets

Run each command once and keep the output in a password manager.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"     # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # EVIDENCE_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # SUMMONS_SEAL_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # REPORT_SEAL_SECRET
```

Choose a `DEMO_PASSWORD` too (8 to 72 characters with upper and lower case and a digit).

## 1. Neon (database)

1. Create a project (region: AWS Asia Pacific, Singapore, close to Render's Singapore region). Postgres 16 or newer.
2. On the dashboard, open **Connect**. Copy the **pooled** connection string (host contains `-pooler`) as `DATABASE_URL`, then switch off "Connection pooling" and copy the **direct** string as `DIRECT_URL`. Both end with `?sslmode=require`.
3. Nothing else: the tables, the audit log trigger and the indexes are created by `prisma migrate deploy` on the first Render build.

## 2. File bucket (Cloudflare R2 or Supabase Storage)

- **R2:** create a bucket (for example `digitaladaalat-files`), then an API token with Object Read & Write on that bucket. `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`.
- **Supabase:** Storage, create a **private** bucket, then Settings, Storage, S3 access keys. `S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3`, `S3_REGION` = the project region.

Keep the bucket private: files are only served through the API, which checks permissions (and decrypts evidence and summons proofs).

## 3. Render (API)

1. New, **Blueprint**, pick this repository. Render reads `render.yaml` (service `digitaladaalat-api`, root `backend`, health check `/api/health`).
2. Render asks for the values marked `sync: false`:

| Variable | Value |
|---|---|
| `FRONTEND_URL` | your Vercel URL, for example `https://digitaladaalat.vercel.app` (set a placeholder first, fix it after step 4) |
| `DATABASE_URL` | Neon pooled URL |
| `DIRECT_URL` | Neon direct URL (used by `prisma migrate deploy`) |
| `JWT_SECRET`, `EVIDENCE_ENCRYPTION_KEY`, `SUMMONS_SEAL_SECRET`, `REPORT_SEAL_SECRET` | from step 0 |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from step 2 |
| `JAAS_APP_ID`, `JAAS_KID`, `JAAS_PRIVATE_KEY` | optional; leave empty to use public Jitsi |

   Already set by the Blueprint: `NODE_VERSION=22`, `NODE_ENV=production`, `TZ=Asia/Karachi`, `TRUST_PROXY=2`, `STORAGE_DRIVER=s3`, `JWT_EXPIRES_IN`, `COOKIE_NAME`. Render sets `PORT` itself.
3. First deploy: the build runs `npm ci --include=dev && npm run build:deploy` (compile, then `prisma migrate deploy`), the start command is `npm run start:prod` (`node dist/main`). If a variable is missing the service stops at startup with a message naming it (never its value).
4. Check `https://digitaladaalat-api.onrender.com/api/health` answers `{"status":"ok","database":"up",...}`. If Render gave the service a different URL, note it for step 4.

The free plan sleeps after 15 minutes without traffic; the first request then takes about a minute. Open the site a few minutes before the defense.

**Time zone.** Render servers run in UTC. Hearing slots, "today", the virtual courtroom window and dates in PDFs are always computed in Pakistan time by the code (`common/pk-time.ts`), and `TZ=Asia/Karachi` keeps any other local-time formatting in Pakistan time too. If the log shows "TZ is not Asia/Karachi" at startup, add the variable. Dates shown to users stay DD-MM-YYYY.

## 4. Vercel (web app)

1. In `frontend/vercel.json`, set the `/api/:path*` destination to your Render URL (default `https://digitaladaalat-api.onrender.com/api/:path*`), commit and push.
2. Vercel, **Add New Project**, import the repository, **Root Directory: `frontend`**. The framework (Vite), build command and output folder come from `vercel.json`. Do **not** set `VITE_API_URL`.
3. Deploy, then copy the production URL into Render's `FRONTEND_URL` and redeploy the API (it is used for CORS and for links in e-mails).

## 5. Demo data (`seed:demo`)

Demo data is fictional and must **never** be loaded into a database with real users: `seed:demo` refuses when it finds accounts it did not create (override only for a demo-only database with `SEED_DEMO_FORCE=true`).

1. Create `backend/.env.production` (git-ignored) with `DATABASE_URL`, `DIRECT_URL`, `EVIDENCE_ENCRYPTION_KEY`, `SUMMONS_SEAL_SECRET`, `STORAGE_DRIVER=s3`, all `S3_*` values (the **same** values as on Render, or the seeded summons photos cannot be decrypted) and `DEMO_PASSWORD`.
2. From `backend/` (migrations already ran on Render; `npx prisma migrate status` with the same env file shows it):

```powershell
$env:DOTENV_CONFIG_PATH = ".env.production"; npm run seed:demo; Remove-Item Env:DOTENV_CONFIG_PATH
```

It prints the demo account names only; every account's password is `DEMO_PASSWORD`. It is safe to run again (re-running also moves the virtual courtroom demo hearings to that day; run it on the defense morning).

3. Delete `backend/.env.production` afterwards, or keep it only in an encrypted place.

## 6. What to back up

- **Secrets** (password manager): losing `EVIDENCE_ENCRYPTION_KEY` makes every evidence file and summons photo unreadable; losing `SUMMONS_SEAL_SECRET` or `REPORT_SEAL_SECRET` makes seals verify as "tampered"; a new `JWT_SECRET` signs everyone out.
- **Database:** Neon keeps a short restore history; also take a dump before the defense and before any migration: `pg_dump "<DIRECT_URL>" -Fc -f digitaladaalat.dump`.
- **Bucket:** copy it with `rclone` or `aws s3 sync --endpoint-url <S3_ENDPOINT>` together with the dump (the database rows point to the stored keys).

## 7. Smoke test after each deploy

- [ ] `/api/health` on Render and `https://<vercel-app>/api/health` both answer `status: ok`.
- [ ] Open the Vercel URL, reload a deep link such as `/admin/cases` (SPA fallback works, no 404).
- [ ] Log in as admin; the session survives a page reload (cookie set on the Vercel domain).
- [ ] File a case as a litigant with a PDF (try one near 20 MB), then download it from the case page.
- [ ] Upload an evidence file and download it (decrypts from the bucket).
- [ ] Export a performance report (PDF) and download it again from the history; "Verify" says valid.
- [ ] Open a summons execution proof photo from the admin registry.
- [ ] Bench Scheduling board loads with today's Pakistan date; Virtual Courtroom Control lists today's demo session.
- [ ] Judge dashboard shows today's hearings and recent orders; an intern certificate PDF downloads and "Verify seal" says valid.
- [ ] Security Alerts: a refused admin route by a test litigant records the real client IP (not a Vercel or Render address). If not, adjust `TRUST_PROXY` before anyone blocks a host.
- [ ] Log out and confirm protected pages redirect to the login page.
