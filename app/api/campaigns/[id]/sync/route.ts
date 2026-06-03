import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Dispatch a manual sync job to the insights-sync queue
  const { Queue } = await import('bullmq');
  const { Redis } = await import('ioredis');
  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const insightsSyncQueue = new Queue('insights-sync', { connection });
  await insightsSyncQueue.add(
    'MANUAL_SYNC',
    { campaignId: params.id },
    { jobId: `manual-sync-${params.id}-${Date.now()}` },
  );
  await connection.quit();

  return NextResponse.json({ triggered: true });
}
