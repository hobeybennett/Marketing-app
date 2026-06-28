# Deployment & Environments

This project runs on **Railway**. To protect paying customers, changes flow
through a dev → staging → production pipeline. Nothing reaches production
without passing CI and being verified on staging first.

## Branch model

| Branch | Deploys to | Purpose |
|---|---|---|
| `main` | **Production** (promohit.up.railway.app) | Live customer site. Protected — only updated by PR from `staging`. |
| `staging` | **Staging** (your staging Railway URL) | Mirror of prod with its own DB/Redis. Test here before promoting. |
| `feature/*` | nothing (CI only) | Day-to-day work. PR into `staging`. |

### The flow

```
feature/my-change  ──PR──▶  staging  ──(verify on staging URL)──▶  PR  ──▶  main  ──▶ prod
        │                      │                                              │
     CI runs                CI runs + auto-deploys to staging         auto-deploys to prod
```

1. Branch off `staging`: `git checkout staging && git pull && git checkout -b feature/x`
2. Open a PR into `staging`. CI must pass (typecheck + unit + e2e).
3. Merge → Railway auto-deploys **staging**. Test the change on the staging URL.
4. When happy, open a PR `staging → main`. Merge → Railway auto-deploys **prod**.

Never push directly to `main` or `staging` — branch protection (below) enforces this.

## Local dev environment

You can run the full pipeline locally without touching any cloud resource:

```bash
# One-time: install ffmpeg + start local Postgres & Redis
sudo apt-get install -y ffmpeg
# (Postgres on :5432, Redis on :6379 — or use Docker)

# Point at local services
export DATABASE_URL="postgresql://USER:PASS@localhost:5432/promohit_dev"
export REDIS_URL="redis://localhost:6379"
export UPLOAD_DIR="/tmp/promohit-uploads"
export MOCK_LLM=true     # skip the Anthropic API
export MOCK_META=true    # skip real Meta ad creation

npx prisma migrate deploy   # set up schema
npm run dev                 # web (port 3000)
npm run worker              # worker (separate terminal)
```

The CI pipeline (`.github/workflows/ci.yml`) spins up real Postgres + Redis +
ffmpeg and runs the full end-to-end pipeline test, so most Railway-specific
issues are caught before merge.

## ──────────────────────────────────────────────────────────────
## RUNBOOK 1 — Point production at `main` (do once)
## ──────────────────────────────────────────────────────────────

Production currently deploys from `claude/migrate-marketing-app-jfiNE`. Repoint it:

1. Railway dashboard → your project → **Production** environment.
2. Open the **web** service → Settings → **Source** → set the deploy branch to `main`.
3. Repeat for the **worker** service (if you run a separate one).
4. Trigger a redeploy. Confirm the app is healthy at `/api/debug`.
5. Once confirmed, the old `claude/migrate-marketing-app-jfiNE` branch can be deleted.

## ──────────────────────────────────────────────────────────────
## RUNBOOK 2 — Create the staging environment (do once)
## ──────────────────────────────────────────────────────────────

Staging MUST have its own database, Redis, and volume so tests never touch
customer data.

1. Railway dashboard → project → **New Environment** → name it `staging`
   (you can "fork" production to copy the service config).
2. In the `staging` environment, add **its own**:
   - **Postgres** plugin (gives a staging `DATABASE_URL`)
   - **Redis** plugin (gives a staging `REDIS_URL`)
   - **Volume** mounted at `/uploads` on both web and worker services
3. Point the staging services' deploy branch to `staging` (Settings → Source).
4. Set staging environment variables (separate from prod):
   - `DATABASE_URL`, `REDIS_URL` → the staging plugins (Railway wires these automatically)
   - `UPLOAD_DIR=/uploads`
   - `NEXTAUTH_URL=https://<your-staging-domain>`
   - `NEXTAUTH_SECRET` → a fresh secret (`openssl rand -base64 32`)
   - `MOCK_META=true` → so staging never creates real ads
   - `ANTHROPIC_API_KEY`, `SPOTIFY_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` →
     can reuse the same keys, or use test keys
5. Deploy. Confirm `/api/debug` on the staging URL is all green.

## ──────────────────────────────────────────────────────────────
## RUNBOOK 3 — Enable branch protection on GitHub (do once)
## ──────────────────────────────────────────────────────────────

GitHub → repo → Settings → Branches → Add branch ruleset for `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass → select the **CI / test** check
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

Repeat for `staging` (you can be slightly looser here if you want faster iteration).

## ──────────────────────────────────────────────────────────────
## RUNBOOK 4 — Adopt Prisma migrations (validate on STAGING first)
## ──────────────────────────────────────────────────────────────

Today `npm start` runs `prisma db push`, which auto-syncs the schema on every
boot with no review — a data-loss risk on a live DB. We want versioned
migrations (`prisma migrate deploy`) instead. Because the databases already
exist, they must be **baselined** (told the initial migration is already applied)
so Prisma doesn't try to re-create existing tables.

**This is the most dangerous change to make — do it on staging first, never
straight to prod.**

1. Generate the baseline migration from the current schema (no DB writes):
   ```bash
   mkdir -p prisma/migrations/0_init
   npx prisma migrate diff \
     --from-empty --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/0_init/migration.sql
   ```
2. Mark it already-applied on **staging** DB (does not run the SQL):
   ```bash
   DATABASE_URL="<staging db url>" npx prisma migrate resolve --applied 0_init
   ```
3. Change the `start` script: `prisma db push --skip-generate` → `prisma migrate deploy`.
4. Deploy to staging, confirm boot + `/api/debug` healthy.
5. Baseline **prod** the same way (`migrate resolve --applied 0_init` against prod DB),
   THEN promote the `start`-script change to `main`.
6. From now on, schema changes are made with `npx prisma migrate dev --name <change>`,
   reviewed in the PR, tested on staging, then auto-applied on prod deploy.

## Backups

Enable automated backups on the **production** Postgres (Railway → Postgres
plugin → Backups). This is your safety net for the migration cutover and any
future incident.
