import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { dispatchStage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, lastSyncAt: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const insights = await prisma.adInsight.findMany({
    where: { campaignId: params.id },
    orderBy: { date: 'desc' },
  });

  // Build summary
  const totalSpend = insights.reduce((s, r) => s + r.spend, 0);
  const totalImpressions = insights.reduce((s, r) => s + r.impressions, 0);
  const totalOutboundClicks = insights.reduce((s, r) => s + r.outboundClicks, 0);
  const avgCtr = insights.length > 0 ? insights.reduce((s, r) => s + r.ctr, 0) / insights.length : 0;
  const avgCpm = insights.length > 0 ? insights.reduce((s, r) => s + r.cpm, 0) / insights.length : 0;
  const avgCpc = insights.length > 0 ? insights.reduce((s, r) => s + r.cpc, 0) / insights.length : 0;

  // Group by adset for best/worst
  const adSetMap = new Map<string, { totalSpend: number; totalImpressions: number; totalCtr: number; count: number; metaAdSetId: string }>();
  for (const row of insights.filter(r => r.metaAdSetId)) {
    const key = row.metaAdSetId!;
    const existing = adSetMap.get(key) ?? { totalSpend: 0, totalImpressions: 0, totalCtr: 0, count: 0, metaAdSetId: key };
    existing.totalSpend += row.spend;
    existing.totalImpressions += row.impressions;
    existing.totalCtr += row.ctr;
    existing.count += 1;
    adSetMap.set(key, existing);
  }

  const adSetSummaries = Array.from(adSetMap.values()).map(as => ({
    metaAdSetId: as.metaAdSetId,
    totalSpend: as.totalSpend,
    totalImpressions: as.totalImpressions,
    avgCtr: as.count > 0 ? as.totalCtr / as.count : 0,
  }));

  adSetSummaries.sort((a, b) => b.avgCtr - a.avgCtr);
  const bestAdSet = adSetSummaries[0] ?? null;
  const worstAdSet = adSetSummaries[adSetSummaries.length - 1] ?? null;

  return NextResponse.json({
    insights,
    lastSyncAt: campaign.lastSyncAt,
    summary: {
      totalSpend,
      totalImpressions,
      avgCtr,
      avgCpm,
      avgCpc,
      totalOutboundClicks,
    },
    bestAdSet,
    worstAdSet,
  });
}

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

  // Trigger manual sync by dispatching to insights-sync queue via a one-off job
  // We can't import insights-sync directly (worker-side code), so we'll run it inline
  // For now, just mark that a sync was requested — the worker will handle it on next run
  // A better solution dispatches to the insights-sync queue
  const { Queue } = await import('bullmq');
  const { Redis } = await import('ioredis');
  const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const insightsSyncQueue = new Queue('insights-sync', { connection });
  await insightsSyncQueue.add('MANUAL_SYNC', { campaignId: params.id }, { jobId: `manual-sync-${params.id}-${Date.now()}` });
  await connection.quit();

  return NextResponse.json({ triggered: true });
}
