import 'dotenv/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import type { StageJob } from '../lib/queue';
import { runSegmentation } from './stages/segmentation';
import { runVideoGen } from './stages/video-gen';
import { runCopyGen } from './stages/copy-gen';
import { runAudienceGen } from './stages/audience-gen';
import { runMetaSetup } from './stages/meta-setup';

const prisma = new PrismaClient();

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker<StageJob>(
  'campaign',
  async (job) => {
    const { campaignId, stage } = job.data;
    console.log(`[worker] starting ${stage} for campaign ${campaignId}`);

    await prisma.campaignJob.updateMany({
      where: { campaignId, stage },
      data: { status: 'RUNNING' },
    });

    try {
      switch (stage) {
        case 'SEGMENTATION':
          await runSegmentation(campaignId);
          break;
        case 'VIDEO_GEN':
          await runVideoGen(campaignId);
          break;
        case 'COPY_GEN':
          await runCopyGen(campaignId);
          break;
        case 'AUDIENCE_GEN':
          await runAudienceGen(campaignId);
          break;
        case 'META_SETUP':
          await runMetaSetup(campaignId);
          break;
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
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  },
  { connection },
);

worker.on('completed', (job) => console.log(`[worker] job ${job.id} (${job.name}) done`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message));

console.log('[worker] started, listening for jobs…');
