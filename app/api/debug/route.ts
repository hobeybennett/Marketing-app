import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
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
    }),
  };

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({ allOk, results }, { status: allOk ? 200 : 500 });
}
