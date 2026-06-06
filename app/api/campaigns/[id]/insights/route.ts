import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { fetchCampaignInsights } from '@/lib/meta-insights';

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

  // All insights ordered by date asc
  const allInsights = await prisma.adInsight.findMany({
    where: { campaignId: params.id },
    orderBy: { date: 'asc' },
  });

  // Smart link clicks
  const allClicks = await prisma.smartLinkClick.findMany({
    where: { campaignId: params.id },
  });

  // Audiences for metaAdSetId → name mapping
  const audiences = await prisma.audience.findMany({
    where: { campaignId: params.id },
  });

  // Campaign-level rows: metaAdSetId IS NULL and metaAdId IS NULL
  const campaignRows = allInsights.filter(r => r.metaAdSetId === null && r.metaAdId === null);

  // Totals from campaign-level rows
  const totalSpend = campaignRows.reduce((s, r) => s + r.spend, 0);
  const totalImpressions = campaignRows.reduce((s, r) => s + r.impressions, 0);
  const totalVideoViews = campaignRows.reduce((s, r) => s + r.videoViews, 0);
  const totalOutboundClicks = campaignRows.reduce((s, r) => s + r.outboundClicks, 0);
  const avgCtr = campaignRows.length > 0
    ? campaignRows.reduce((s, r) => s + r.ctr, 0) / campaignRows.length
    : 0;
  const cpcRows = campaignRows.filter(r => r.cpc > 0);
  const avgCpc = cpcRows.length > 0
    ? cpcRows.reduce((s, r) => s + r.cpc, 0) / cpcRows.length
    : 0;

  // Daily array from campaign-level rows
  const daily = campaignRows.map(r => ({
    date: r.date,
    spend: r.spend,
    impressions: r.impressions,
    ctr: r.ctr,
  }));

  // Adset breakdown grouped by metaAdSetId (adset-level rows only)
  const adsetRows = allInsights.filter(r => r.metaAdSetId !== null && r.metaAdId === null);
  const adsetMap = new Map<string, { spend: number; impressions: number; ctrSum: number; count: number }>();
  for (const row of adsetRows) {
    const key = row.metaAdSetId!;
    const existing = adsetMap.get(key) ?? { spend: 0, impressions: 0, ctrSum: 0, count: 0 };
    existing.spend += row.spend;
    existing.impressions += row.impressions;
    existing.ctrSum += row.ctr;
    existing.count += 1;
    adsetMap.set(key, existing);
  }

  const audienceMap = new Map(audiences.map(a => [a.metaAdSetId, a]));
  const adsetBreakdown = Array.from(adsetMap.entries()).map(([metaAdSetId, data]) => {
    const aud = audienceMap.get(metaAdSetId);
    return {
      metaAdSetId,
      audienceName: aud?.name ?? null,
      audienceType: aud?.type ?? null,
      spend: data.spend,
      impressions: data.impressions,
      avgCtr: data.count > 0 ? data.ctrSum / data.count : 0,
    };
  });

  // Smart link click summary
  const byPlatform: Record<string, number> = {};
  for (const click of allClicks) {
    const platform = click.platform ?? 'unknown';
    byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
  }

  // Per-creative stats
  const creatives = await prisma.videoCreative.findMany({
    where: { campaignId: params.id },
    include: { segment: true },
    orderBy: { createdAt: 'asc' },
  });

  const adLevel = allInsights.filter(i => !!i.metaAdId);

  const creativeStats = creatives.map((creative, index) => {
    const rows = adLevel.filter(i => i.metaAdId === creative.metaAdId);
    const totalSpendC = rows.reduce((s, r) => s + r.spend, 0);
    const totalImpressionsC = rows.reduce((s, r) => s + r.impressions, 0);
    const totalVideoViewsC = rows.reduce((s, r) => s + r.videoViews, 0);
    const totalOutboundClicksC = rows.reduce((s, r) => s + r.outboundClicks, 0);
    const avgCtrC = rows.length > 0 ? rows.reduce((s, r) => s + r.ctr, 0) / rows.length : 0;
    return {
      id: creative.id,
      index,
      metaAdId: creative.metaAdId,
      fileUrl: creative.fileUrl,
      ctaText: creative.ctaText,
      adStatus: creative.adStatus,
      startSec: creative.segment?.startSec ?? null,
      endSec: creative.segment?.endSec ?? null,
      totalSpend: totalSpendC,
      totalImpressions: totalImpressionsC,
      totalVideoViews: totalVideoViewsC,
      totalOutboundClicks: totalOutboundClicksC,
      avgCtr: avgCtrC,
      hasData: rows.length > 0,
    };
  });

  return NextResponse.json({
    totals: {
      spend: totalSpend,
      impressions: totalImpressions,
      videoViews: totalVideoViews,
      outboundClicks: totalOutboundClicks,
      avgCtr,
      avgCpc,
    },
    daily,
    adsetBreakdown,
    smartLinkClicks: {
      total: allClicks.length,
      byPlatform,
    },
    lastSyncAt: campaign.lastSyncAt,
    creativeStats,
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

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { user: { include: { metaConnection: true } } },
    });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (campaign.userId && campaign.userId !== session.user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (!campaign.metaCampaignId) {
      return NextResponse.json(
        { error: 'Campaign has no Meta campaign ID yet — launch the campaign first.' },
        { status: 400 },
      );
    }

    const token =
      campaign.user?.metaConnection?.accessToken ?? process.env.META_ACCESS_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: 'No Meta access token available. Connect your Meta account in Settings.' },
        { status: 400 },
      );
    }

    const insights = await fetchCampaignInsights(campaign.metaCampaignId, token);

    for (const insight of insights) {
      const existing = await prisma.adInsight.findFirst({
        where: {
          campaignId: params.id,
          metaAdSetId: insight.metaAdSetId ?? null,
          metaAdId: insight.metaAdId ?? null,
          date: insight.date,
        },
      });

      const payload = {
        spend: insight.spend,
        impressions: insight.impressions,
        cpm: insight.cpm,
        ctr: insight.ctr,
        cpc: insight.cpc,
        outboundClicks: insight.outboundClicks,
        videoViews: insight.videoViews,
      };

      if (existing) {
        await prisma.adInsight.update({ where: { id: existing.id }, data: payload });
      } else {
        await prisma.adInsight.create({
          data: {
            campaignId: params.id,
            metaAdSetId: insight.metaAdSetId ?? null,
            metaAdId: insight.metaAdId ?? null,
            date: insight.date,
            ...payload,
          },
        });
      }
    }

    await prisma.campaign.update({
      where: { id: params.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({ synced: insights.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
