/**
 * End-to-end pipeline test — spawns the real worker against real Postgres + Redis,
 * generates a tiny 35-second audio file, creates a campaign, dispatches SEGMENTATION,
 * and verifies the campaign progresses through all 5 stages.
 *
 * Uses MOCK_LLM=true and MOCK_META=true so no external API calls are made.
 * Requires: DATABASE_URL, REDIS_URL, ffmpeg installed (provided by CI).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const SKIP = !process.env.DATABASE_URL || !process.env.REDIS_URL;

describe.skipIf(SKIP)('pipeline e2e', () => {
  const campaignId = uuidv4();
  const uploadDir = '/tmp/promohit-e2e-test';
  const campaignDir = path.join(uploadDir, campaignId);
  const createdIds: string[] = [campaignId];
  let prisma: PrismaClient;
  let worker: ChildProcess;
  let queue: Queue;
  let conn: Redis;

  // Create a second campaign (reusing the same audio/cover assets) and dispatch it.
  async function seedCampaign(id: string, autoLaunch: boolean) {
    const dir = path.join(uploadDir, id);
    await mkdir(dir, { recursive: true });
    const audioPath = path.join(dir, 'audio.mp3');
    const coverPath = path.join(dir, 'cover.jpg');
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=35',
        '-c:a', 'libmp3lame', '-b:a', '64k', audioPath], { stdio: 'ignore' });
      ff.on('exit', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg gen failed')));
    });
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=100x100', '-vframes', '1', coverPath], { stdio: 'ignore' });
      ff.on('exit', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg cover failed')));
    });
    await prisma.campaign.create({
      data: {
        id, artistName: 'E2E Artist', songTitle: 'E2E Song',
        audioUrl: audioPath, coverArtUrl: coverPath, status: 'PROCESSING',
        autoLaunch, soundsLike: ['Test Band'], promoteType: 'track',
        jobs: { create: [
          { stage: 'SEGMENTATION', status: 'PENDING' },
          { stage: 'VIDEO_GEN', status: 'PENDING' },
          { stage: 'COPY_GEN', status: 'PENDING' },
          { stage: 'AUDIENCE_GEN', status: 'PENDING' },
          { stage: 'META_SETUP', status: 'PENDING' },
        ]},
      },
    });
    createdIds.push(id);
    await queue.add('SEGMENTATION', { campaignId: id, stage: 'SEGMENTATION' }, {
      attempts: 3, backoff: { type: 'exponential', delay: 5000 },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Generate a 35-second tone (long enough for 5x30s segments with auto-spacing
    // when track is < 150s — 35s / 5 = 7s step, plenty of overlap is fine for test)
    await mkdir(campaignDir, { recursive: true });
    const audioPath = path.join(campaignDir, 'audio.mp3');
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=35',
        '-c:a', 'libmp3lame', '-b:a', '64k', audioPath,
      ], { stdio: 'ignore' });
      ff.on('exit', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg gen failed')));
    });

    // Generate a tiny 100x100 cover image
    const coverPath = path.join(campaignDir, 'cover.jpg');
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=100x100', '-vframes', '1', coverPath,
      ], { stdio: 'ignore' });
      ff.on('exit', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg cover failed')));
    });

    // Create campaign in DB with 5 PENDING jobs
    await prisma.campaign.create({
      data: {
        id: campaignId,
        artistName: 'E2E Test Artist',
        songTitle: 'E2E Test Song',
        audioUrl: audioPath,
        coverArtUrl: coverPath,
        status: 'PROCESSING',
        autoLaunch: true,
        soundsLike: ['Test Band'],
        promoteType: 'track',
        jobs: { create: [
          { stage: 'SEGMENTATION', status: 'PENDING' },
          { stage: 'VIDEO_GEN', status: 'PENDING' },
          { stage: 'COPY_GEN', status: 'PENDING' },
          { stage: 'AUDIENCE_GEN', status: 'PENDING' },
          { stage: 'META_SETUP', status: 'PENDING' },
        ]},
      },
    });

    // Spawn worker with mocks enabled
    const workerEnv = {
      ...process.env,
      UPLOAD_DIR: uploadDir,
      MOCK_LLM: 'true',
      MOCK_META: 'true',
    };
    worker = spawn('npx', ['tsx', path.resolve(__dirname, '../workers/index.ts')], {
      env: workerEnv,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    // Wait for worker to be ready
    await new Promise((r) => setTimeout(r, 3000));

    // Dispatch first stage
    conn = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    queue = new Queue('campaign', { connection: conn });
    await queue.add('SEGMENTATION', { campaignId, stage: 'SEGMENTATION' }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }, 30_000);

  afterAll(async () => {
    if (worker) {
      worker.kill('SIGTERM');
      // Force-kill if graceful shutdown hangs (BullMQ close() can stall),
      // otherwise the worker lingers and competes with the next run's queue.
      await Promise.race([
        new Promise((r) => worker.once('exit', r)),
        new Promise((r) => setTimeout(() => { worker.kill('SIGKILL'); r(null); }, 5000)),
      ]);
    }
    if (queue) await queue.close();
    if (conn) await conn.quit();
    for (const id of createdIds) {
      await prisma.campaign.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
    if (existsSync(uploadDir)) await rm(uploadDir, { recursive: true, force: true });
  });

  it('completes all 5 pipeline stages within 90s', async () => {
    const deadline = Date.now() + 90_000;
    let lastStatus = '';
    while (Date.now() < deadline) {
      const c = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { jobs: true, segments: true, creatives: true, audiences: true },
      });
      lastStatus = c?.status ?? 'unknown';

      if (lastStatus === 'LIVE') {
        // Verify pipeline outputs
        expect(c!.segments.length).toBe(5);
        expect(c!.creatives.length).toBe(5);
        expect(c!.audiences.length).toBe(3);
        expect(c!.jobs.every((j) => j.status === 'DONE')).toBe(true);
        return;
      }
      if (lastStatus === 'FAILED') {
        const failedJob = c?.jobs.find((j) => j.status === 'FAILED');
        throw new Error(`Pipeline failed at ${failedJob?.stage}: ${failedJob?.error}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Pipeline timed out at status=${lastStatus}`);
  }, 100_000);

  it('non-autoLaunch: ad copy is ready BEFORE videos finish, ends at READY', async () => {
    const id = uuidv4();
    await seedCampaign(id, false);

    const deadline = Date.now() + 90_000;
    let copyReadyBeforeVideos = false;
    let lastStatus = '';

    while (Date.now() < deadline) {
      const c = await prisma.campaign.findUnique({
        where: { id },
        include: { jobs: true, segments: true, creatives: true, audiences: true, adCopies: true },
      });
      lastStatus = c?.status ?? 'unknown';
      const job = (s: string) => c?.jobs.find((j) => j.stage === s)?.status;

      // The core UX guarantee: copy + audiences complete while video is still pending/running.
      if (job('COPY_GEN') === 'DONE' && job('AUDIENCE_GEN') === 'DONE' && job('VIDEO_GEN') !== 'DONE') {
        copyReadyBeforeVideos = true;
        expect(c!.adCopies.length).toBeGreaterThan(0); // user can pick copy already
      }

      if (lastStatus === 'READY') {
        expect(copyReadyBeforeVideos).toBe(true);
        expect(c!.creatives.length).toBe(5);
        expect(c!.audiences.length).toBe(3);
        expect(c!.adCopies.length).toBeGreaterThan(0);
        // META_SETUP must NOT have run yet — that waits for the user to click Launch.
        expect(job('META_SETUP')).toBe('PENDING');
        return;
      }
      if (lastStatus === 'FAILED') {
        const failedJob = c?.jobs.find((j) => j.status === 'FAILED');
        throw new Error(`Pipeline failed at ${failedJob?.stage}: ${failedJob?.error}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Pipeline timed out at status=${lastStatus} (copyReadyBeforeVideos=${copyReadyBeforeVideos})`);
  }, 100_000);
});
