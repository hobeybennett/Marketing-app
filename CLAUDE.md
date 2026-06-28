# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Promohit** is an automated music promotion platform. Users paste a Spotify link, upload an audio file, customise visuals, and the platform generates 5 × 30-second MP4 ad creatives, writes ad copy via Claude API, builds audiences, and launches a Meta (Facebook/Instagram) ad campaign — all automatically.

## Branches & deployment

- `main` → **production** (live customers). Protected; only updated via PR from `staging`.
- `staging` → **staging** environment (own DB/Redis). Verify changes here first.
- `feature/*` → day-to-day work; PR into `staging`.

Never push directly to `main`. Full flow, Railway setup, and the migration plan
are in **`DEPLOYMENT.md`**.

## Commands

```bash
# Development
npm run dev          # Next.js web app (port 3000)
npm run worker       # BullMQ worker process (separate terminal)

# Database
npm run db:push      # Sync schema to DB without migrations (dev)
npm run db:migrate   # Create a migration file (dev)
npm run db:studio    # Prisma Studio GUI

# Type checking & tests
npx tsc --noEmit     # TypeScript check (run before committing)
npm test             # Vitest (run once)
npm run test:watch   # Vitest (watch mode)

# Single test file
npx vitest run __tests__/utils.test.ts

# After any schema change
npx prisma generate  # Regenerate Prisma client (required before tsc)
```

The **web app and worker must run as two separate processes** — they share the same DB and Redis but the worker has no HTTP server.

## Architecture

### Two-Process Design

```
Next.js (web)  ──POST /api/campaigns──▶  Redis (BullMQ queue)  ◀──  Worker (tsx)
                                                                          │
                                                              5 sequential pipeline stages
```

`lib/queue.ts` exports `dispatchStage(campaignId, stage)` — every stage dispatches the next one when it finishes. All jobs use `attempts: 3` with exponential backoff (5s base).

### Pipeline Stages (workers/stages/)

Stages run sequentially; each stage deletes its own existing DB records at the start for retry idempotency.

| Stage | Does | Dispatches next |
|---|---|---|
| `SEGMENTATION` | FFmpeg cuts audio into 5 × 30s MP3 clips using `clipDefinitions` or even spacing | `VIDEO_GEN` |
| `VIDEO_GEN` | FFmpeg renders 1080×1080 MP4 per clip (cover art loop + blur + drawtext overlays from `visualConfig`) | Sets `CONTENT_READY`, stops. If `autoLaunch=true` dispatches `COPY_GEN` instead |
| `COPY_GEN` | Claude API (`claude-haiku-4-5`) generates headline/primaryText/description per creative | `AUDIENCE_GEN` |
| `AUDIENCE_GEN` | Creates 3 audiences (INTEREST/RETARGETING/LOOKALIKE). If `autoLaunch=true` dispatches `META_SETUP`; else sets `READY` | `META_SETUP` (autoLaunch) or stops |
| `META_SETUP` | Creates Meta campaign → uploads videos → creates AdCreatives → creates AdSets + Ads → sets `LIVE` | — |

### Two-Phase Campaign Flow (non-autoLaunch)

1. **Content phase**: `PROCESSING → CONTENT_READY` — user reviews 5 video previews
2. User clicks **Continue** → `PATCH /api/campaigns/[id]` with `{ action: "continue" }` → `BUILDING`
3. **Campaign phase**: `BUILDING → READY` — user reviews ad copy + audiences
4. User clicks **Launch** → `PATCH /api/campaigns/[id]` with `{ action: "launch" }` → `LAUNCHING → LIVE`

### Meta Credentials (per-user)

`meta-setup.ts` resolves credentials in priority order:
1. `campaign.user.metaConnection` — user's stored OAuth token (preferred for consumer use)
2. `META_ACCESS_TOKEN` / `META_AD_ACCOUNT_ID` / `META_PAGE_ID` env vars — legacy / fallback
3. If no token at all → mock mode (sets `LIVE` with fake ID, no real API calls)

### File Storage

All uploads live under `UPLOAD_DIR` (default `/uploads` — a Railway Volume mounted to both web and worker):
```
/uploads/{campaignId}/
  audio.mp3
  cover.jpg
  background.jpg       (if uploaded)
  segments/segment_0..4.mp3
  videos/creative_0..4.mp4
```

MP4s are served via `GET /api/videos/[campaignId]/[filename]` with path-traversal protection.

### Auth

- NextAuth v4 with Google provider + Prisma adapter (database sessions)
- `lib/auth.ts` exports `getServerSession()` — use this in server components/routes, not the NextAuth default
- `middleware.ts` protects `/campaigns/*` and `/settings/*`
- Meta OAuth: `GET /api/auth/meta` → Facebook consent → `GET /api/auth/meta/callback` stores 60-day long-lived token in `MetaConnection`

### Key Files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Full data model — Campaign, User, MetaConnection, VideoCreative, Audience, etc. |
| `lib/queue.ts` | BullMQ queue + `dispatchStage()` |
| `lib/auth.ts` | NextAuth config |
| `lib/prisma.ts` | Singleton PrismaClient for Next.js (hot-reload safe) |
| `workers/prisma.ts` | Separate PrismaClient singleton for the worker process |
| `workers/index.ts` | Worker entry — handles retries, SIGTERM, marks campaign FAILED only on last attempt |
| `app/api/campaigns/route.ts` | POST: saves audio + cover art, creates campaign + 5 CampaignJob rows, dispatches SEGMENTATION |
| `app/campaigns/new/page.tsx` | Large client component — visual editor with per-element text styles, background, animations, clip range sliders |

## Environment Variables

Required for all functionality (see `.env.example` for full list):

```
DATABASE_URL          PostgreSQL connection string
REDIS_URL             Redis connection string  
UPLOAD_DIR            File storage path (must be shared volume in production)
ANTHROPIC_API_KEY     Claude API (copy-gen stage)
SPOTIFY_CLIENT_ID     Spotify Web API (track lookup)
SPOTIFY_CLIENT_SECRET
NEXTAUTH_URL          Full app URL (e.g. https://promohit.up.railway.app)
NEXTAUTH_SECRET       Random 32+ char string (openssl rand -base64 32)
GOOGLE_CLIENT_ID      Google OAuth
GOOGLE_CLIENT_SECRET
META_APP_ID           Meta developer app
META_APP_SECRET
```

## Deployment (Railway)

- **Web service**: `npm run start` (runs `prisma db push` then `next start`)
- **Worker service**: `npm run worker`
- Both services share the same Volume mounted at `/uploads`
- `nixpacks.toml` installs FFmpeg via Nix
- After schema changes: `npx prisma migrate deploy` from local machine with `DATABASE_URL` set

## Meta API Notes

- API version: `v22.0`
- Campaign objective: `OUTCOME_TRAFFIC` with `destination_type: WEBSITE`
- Ads use pre-created `AdCreative` objects (not inline creative) — the `/ads` endpoint only accepts `creative_id`
- CTA type: `LISTEN_MUSIC`
- Targeting: Advantage+ (`targeting_automation: { advantage_audience: 1 }`) for INTEREST audiences — avoids needing numeric interest IDs
- `bid_strategy: LOWEST_COST_WITH_BID_CAP`, `bid_amount: 200` (cents), `daily_budget: 1000` (cents)
- AdSet retry idempotency: skip creation if `audience.metaAdSetId` already set; skip campaign creation if `campaign.metaCampaignId` already set
