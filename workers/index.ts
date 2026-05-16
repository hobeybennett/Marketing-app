import 'dotenv/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { StageJob } from '../lib/queue';
import { prisma } from './prisma';
import { runSegmentation } from './stages/segmentation';
import { runVideoGen } from './stages/video-gen';
import { runCopyGen } from './stages/copy-gen';
import { runAudienceGen } from './stages/audience-gen';
import { runMetaSetup } from './stages/meta-setup';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

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

    // Reset campaign to in-progress status if it was previously set to FAILED
    const inProgressStatus = ['SEGMENTATION', 'VIDEO_GEN'].includes(stage) ? 'PROCESSING' : 'BUILDING';
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
  { connection },
);

worker.on('completed', (job) => console.log(`[worker] job ${job.id} (${job.name}) done`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message));

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, draining…');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

console.log('[worker] started, listening for jobs…');
