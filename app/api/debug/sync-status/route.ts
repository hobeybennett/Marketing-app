import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Diagnoses the auto insights-sync: is the repeatable schedule registered, is the
// worker draining the queue, are jobs failing, and when did each campaign last sync?
export async function GET() {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  });

  try {
    const queue = new Queue('insights-sync', { connection });
    const [repeatables, counts, failedJobs] = await Promise.all([
      queue.getRepeatableJobs(),
      queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      queue.getJobs(['failed'], 0, 5),
    ]);

    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ['LIVE', 'PAUSED'] } },
      select: { id: true, songTitle: true, status: true, lastSyncAt: true, metaCampaignId: true },
    });

    await queue.close();

    return NextResponse.json({
      repeatables: repeatables.map((r) => ({
        name: r.name,
        everyMs: r.every,
        next: r.next ? new Date(r.next).toISOString() : null,
      })),
      jobCounts: counts,
      recentFailed: failedJobs.map((j) => ({ name: j?.name, reason: j?.failedReason, at: j?.finishedOn ? new Date(j.finishedOn).toISOString() : null })),
      campaigns: campaigns.map((c) => ({
        song: c.songTitle,
        status: c.status,
        hasMetaId: !!c.metaCampaignId,
        lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
      })),
      serverTime: new Date().toISOString(),
    });
  } finally {
    connection.quit();
  }
}
