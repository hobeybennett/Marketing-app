import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { StageJob } from '../lib/queue';
import { prisma } from './prisma';
import { runSegmentation } from './stages/segmentation';
import { runVideoGen } from './stages/video-gen';
import { runCopyGen } from './stages/copy-gen';
import { runAudienceGen } from './stages/audience-gen';
import { runMetaSetup } from './stages/meta-setup';
import { runInsightsSync } from './stages/insights-sync';
import { runOptimisation } from './stages/optimise';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ requires a dedicated ioredis connection per Queue/Worker — Workers use
// blocking commands that cannot share a connection with Queues or other Workers.
function makeConn() {
  const conn = new Redis(REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 5000 });
  conn.on('error', (err) => console.error('[worker] Redis error:', err.message));
  return conn;
}

// ── Repeatable jobs queue ────────────────────────────────────────────────────
const insightsSyncQueue = new Queue('insights-sync', { connection: makeConn() });
const optimiseQueue     = new Queue('optimise',       { connection: makeConn() });

// Register repeatable jobs. Clear any previously-registered schedules first so
// interval changes actually take effect (BullMQ keys repeatables by interval, so
// a changed `every` would otherwise leave the old schedule running alongside).
(async () => {
  try {
    for (const j of await insightsSyncQueue.getRepeatableJobs()) {
      await insightsSyncQueue.removeRepeatableByKey(j.key);
    }
    await insightsSyncQueue.add(
      'SYNC_ALL_LIVE',
      {},
      { repeat: { every: 2 * 60 * 60 * 1000 }, jobId: 'insights-sync-repeatable' }, // every 2 hours
    );
  } catch (err) {
    console.error('[worker] Failed to register insights-sync repeatable job:', err);
  }

  try {
    for (const j of await optimiseQueue.getRepeatableJobs()) {
      await optimiseQueue.removeRepeatableByKey(j.key);
    }
    await optimiseQueue.add(
      'OPTIMISE_ALL_LIVE',
      {},
      { repeat: { every: 12 * 60 * 60 * 1000 }, jobId: 'optimise-repeatable' }, // every 12 hours
    );
  } catch (err) {
    console.error('[worker] Failed to register optimise repeatable job:', err);
  }
})();

// ── Insights sync worker ─────────────────────────────────────────────────────
const insightsSyncWorker = new Worker(
  'insights-sync',
  async () => {
    const liveCampaigns = await prisma.campaign.findMany({
      where: { status: 'LIVE', metaCampaignId: { not: null } },
      select: { id: true },
    });
    for (const c of liveCampaigns) {
      await runInsightsSync(c.id);
    }
  },
  { connection: makeConn() },
);
insightsSyncWorker.on('failed', (_job: unknown, err: Error) =>
  console.error('[insights-sync worker] failed:', err.message),
);
insightsSyncWorker.on('error', (err) =>
  console.error('[insights-sync worker] error:', err.message),
);

// ── Optimise worker ──────────────────────────────────────────────────────────
const optimiseWorker = new Worker(
  'optimise',
  async () => {
    const liveCampaigns = await prisma.campaign.findMany({
      where: { status: 'LIVE', metaCampaignId: { not: null } },
      select: { id: true },
    });
    for (const c of liveCampaigns) {
      await runOptimisation(c.id);
    }
  },
  { connection: makeConn() },
);
optimiseWorker.on('failed', (_job: unknown, err: Error) =>
  console.error('[optimise worker] failed:', err.message),
);
optimiseWorker.on('error', (err) =>
  console.error('[optimise worker] error:', err.message),
);

const worker = new Worker<StageJob>(
  'campaign',
  async (job) => {
    const { campaignId, stage } = job.data;
    console.log(`[worker] starting ${stage} for campaign ${campaignId} (attempt ${job.attemptsMade + 1})`);

    // Reset job to RUNNING at the start of each attempt (handles retries after failure)
    await prisma.campaignJob.updateMany({
      where: { campaignId, stage },
      data: { status: 'RUNNING' },
    });

    // Reset campaign to in-progress status if it was previously set to FAILED.
    // All content stages (segmentation, copy, audiences, video) are part of the
    // PROCESSING phase now; only META_SETUP belongs to LAUNCHING.
    const inProgressStatus = stage === 'META_SETUP' ? 'LAUNCHING' : 'PROCESSING';
    await prisma.campaign.updateMany({
      where: { id: campaignId, status: 'FAILED' },
      data: { status: inProgressStatus },
    });

    try {
      switch (stage) {
        case 'SEGMENTATION': await runSegmentation(campaignId); break;
        case 'VIDEO_GEN':    await runVideoGen(campaignId);     break;
        case 'COPY_GEN':     await runCopyGen(campaignId);      break;
        case 'AUDIENCE_GEN': await runAudienceGen(campaignId);  break;
        case 'META_SETUP':   await runMetaSetup(campaignId);    break;
      }

      await prisma.campaignJob.updateMany({
        where: { campaignId, stage },
        data: { status: 'DONE' },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await prisma.campaignJob.updateMany({
        where: { campaignId, stage },
        data: { status: 'FAILED', error },
      });

      // Only mark the campaign FAILED when there are no retries left
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= maxAttempts) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'FAILED' },
        });
      }
      throw err;
    }
  },
  {
    connection: makeConn(),
    concurrency: 1,
    // Video generation can take 5+ minutes per campaign (5 clips × FFmpeg).
    // Default lockDuration is 30s which causes jobs to stall, especially when
    // the worker process restarts during a deploy. Bump to 15 min.
    lockDuration: 15 * 60 * 1000,
    stalledInterval: 60 * 1000,
  },
);

worker.on('completed', (job) => console.log(`[worker] job ${job.id} (${job.name}) done`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message));
worker.on('error', (err) => console.error('[worker] error:', err.message));

// When BullMQ detects a stalled job, mark the CampaignJob FAILED in the DB
// so the UI doesn't spin forever. Without this, stalls leave the campaign in
// PROCESSING/BUILDING with no error and no progress.
worker.on('stalled', async (jobId: string) => {
  console.error(`[worker] job ${jobId} stalled — marking campaign FAILED`);
  try {
    const queue = new Queue('campaign', { connection: makeConn() });
    const job = await queue.getJob(jobId);
    await queue.close();
    if (!job?.data) return;
    const { campaignId, stage } = job.data as StageJob;
    await prisma.campaignJob.updateMany({
      where: { campaignId, stage },
      data: { status: 'FAILED', error: 'Worker stalled — job exceeded lock duration. Retry from the UI.' },
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED' },
    });
  } catch (err) {
    console.error('[worker] stalled handler error:', err);
  }
});

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, draining…`);
  // Force-exit if graceful drain hangs (BullMQ close() can stall), so Railway
  // deploy restarts and tests don't leave a lingering worker on the queue.
  const force = setTimeout(() => {
    console.warn('[worker] graceful shutdown timed out, forcing exit');
    process.exit(0);
  }, 10_000);
  try {
    await Promise.all([worker.close(), insightsSyncWorker.close(), optimiseWorker.close()]);
    await prisma.$disconnect();
  } catch (err) {
    console.error('[worker] shutdown error:', err);
  }
  clearTimeout(force);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[worker] started, listening for jobs…');
