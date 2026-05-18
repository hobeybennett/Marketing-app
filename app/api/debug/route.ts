import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Quick campaign status check: /api/debug?campaign=<id>
  const campaignId = req.nextUrl.searchParams.get('campaign');
  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { jobs: true },
    });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      id: campaign.id,
      status: campaign.status,
      jobs: campaign.jobs.map(j => ({ stage: j.stage, status: j.status, error: j.error })),
    });
  }
  const results: Record<string, { ok: boolean; detail: string }> = {};

  // 1. Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.database = { ok: true, detail: 'Connected' };
  } catch (err) {
    results.database = { ok: false, detail: String(err) };
  }

  // 2. File system
  try {
    const uploadDir = process.env.UPLOAD_DIR || '/uploads';
    const testDir = path.join(uploadDir, '_debug_test');
    await mkdir(testDir, { recursive: true });
    await writeFile(path.join(testDir, 'test.txt'), 'ok');
    await rm(testDir, { recursive: true });
    results.filesystem = { ok: true, detail: `Wrote to ${uploadDir}` };
  } catch (err) {
    results.filesystem = { ok: false, detail: String(err) };
  }

  // 3. Redis
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, connectTimeout: 5000 });
    await redis.ping();
    await redis.quit();
    results.redis = { ok: true, detail: 'PONG received' };
  } catch (err) {
    results.redis = { ok: false, detail: String(err) };
  }

  // 4. Queue
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const conn = new Redis(redisUrl, { maxRetriesPerRequest: 0, connectTimeout: 5000 });
    const queue = new Queue('campaign', { connection: conn });
    await queue.getJobCounts();
    await queue.close();
    results.queue = { ok: true, detail: 'BullMQ queue reachable' };
  } catch (err) {
    results.queue = { ok: false, detail: String(err) };
  }

  // 5. Env vars
  results.env = {
    ok: true,
    detail: JSON.stringify({
      DATABASE_URL: process.env.DATABASE_URL ? '✓ set' : '✗ missing',
      REDIS_URL: process.env.REDIS_URL ? '✓ set' : '✗ missing',
      UPLOAD_DIR: process.env.UPLOAD_DIR || '(default /uploads)',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ missing',
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID ? '✓ set' : '✗ missing',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ? '✓ set' : '✗ missing',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? '✓ set' : '✗ missing',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✓ set' : '✗ missing',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '✓ set' : '✗ missing',
    }),
  };

  // 6. Auth session
  try {
    const session = await getServerSession();
    results.auth = {
      ok: true,
      detail: session ? `Signed in as ${session.user?.email}` : 'No session (not signed in)',
    };
  } catch (err) {
    results.auth = { ok: false, detail: String(err) };
  }

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({ allOk, results }, { status: allOk ? 200 : 500 });
}
