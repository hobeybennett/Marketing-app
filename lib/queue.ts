import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
});
connection.on('error', (err) => console.error('[queue] Redis error:', err.message));

export const campaignQueue = new Queue('campaign', { connection });

export type StageJob = {
  campaignId: string;
  stage: 'SEGMENTATION' | 'VIDEO_GEN' | 'COPY_GEN' | 'AUDIENCE_GEN' | 'META_SETUP';
};

export async function dispatchStage(campaignId: string, stage: StageJob['stage']) {
  await campaignQueue.add(stage, { campaignId, stage } satisfies StageJob, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}
