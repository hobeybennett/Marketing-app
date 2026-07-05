import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { fetchCampaignInsights } from '@/lib/meta-insights';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, lastSyncAt: true, dailyBudget: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // ?debug=live — compare what's stored vs what Meta returns live, to pinpoint
  // sync discrepancies (right campaign id? fetch complete? storage stale?).
  if (req.nextUrl.searchParams.get('debug') === 'live') {
    const full = await prisma.campaign.findUnique({
      where: { id: params.id },
      select: { metaCampaignId: true, user: { select: { metaConnection: { select: { accessToken: true } } } } },
    });
    const token = full?.user?.metaConnection?.accessToken ?? process.env.META_ACCESS_TOKEN;
    if (!full?.metaCampaignId || !token) {
      return NextResponse.json({ error: 'no meta campaign id or token' }, { status: 400 });
    }
    const stored = await prisma.adInsight.findMany({ where: { campaignId: params.id } });
    const storedCampaign = stored.filter((r) => r.metaAdSetId === null && r.metaAdId === null);
    const live = await fetchCampaignInsights(full.metaCampaignId, token);
    const liveCampaign = live.filter((r) => !r.metaAdSetId && !r.metaAdId);
    const sumImp = (rows: { impressions: number }[]) => rows.reduce((s, r) => s + r.impressions, 0);
    const sumSpend = (rows: { spend: number }[]) => +rows.reduce((s, r) => s + r.spend, 0).toFixed(2);
    return NextResponse.json({
      metaCampaignId: full.metaCampaignId,
      stored: { rows: storedCampaign.length, impressions: sumImp(storedCampaign), spend: sumSpend(storedCampaign) },
      live: { rows: liveCampaign.length, impressions: sumImp(liveCampaign), spend: sumSpend(liveCampaign) },
      liveTotalRowsAllLevels: live.length,
    });
  }

  const allInsights = await prisma.adInsight.findMany({
    where: { campaignId: params.id },
    orderBy: { date: 'asc' },
  });

  const allClicks = await prisma.smartLinkClick.findMany({
    where: { campaignId: params.id },
  });

  const audiences = await prisma.audience.findMany({
    where: { campaignId: params.id },
  });

  // Campaign-level rows (no adset/ad breakdown)
  const campaignRows = allInsights.filter(r => r.metaAdSetId === null && r.metaAdId === null);

  const totalSpend = campaignRows.reduce((s, r) => s + r.spend, 0);
  const totalImpressions = campaignRows.reduce((s, r) => s + r.impressions, 0);
  const totalVideoViews = campaignRows.reduce((s, r) => s + r.videoViews, 0);
  const totalOutboundClicks = campaignRows.reduce((s, r) => s + r.outboundClicks, 0);
  const avgCtr = campaignRows.length > 0
    ? campaignRows.reduce((s, r) => s + r.ctr, 0) / campaignRows.length : 0;
  const cpcRows = campaignRows.filter(r => r.cpc > 0);
  const avgCpc = cpcRows.length > 0
    ? cpcRows.reduce((s, r) => s + r.cpc, 0) / cpcRows.length : 0;

  // Today's spend for budget remaining
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRows = campaignRows.filter(r => r.date.toISOString().split('T')[0] === todayStr);
  const todaySpend = todayRows.reduce((s, r) => s + r.spend, 0);

  // Smart link conversions = clicks through to a streaming platform (Spotify).
  // A page_view is just landing on the page, not a conversion, so exclude it.
  const conversionClicks = allClicks.filter((c) => c.platform && c.platform !== 'page_view');
  const smartLinkTotal = conversionClicks.length;
  const costPerConversion = smartLinkTotal > 0 ? totalSpend / smartLinkTotal : null;

  const daily = campaignRows.map(r => ({
    date: r.date,
    spend: r.spend,
    impressions: r.impressions,
    ctr: r.ctr,
  }));

  // Adset breakdown
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

  const byPlatform: Record<string, number> = {};
  for (const click of conversionClicks) {
    const platform = click.platform ?? 'unknown';
    byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
  }

  const creatives = await prisma.videoCreative.findMany({
    where: { campaignId: params.id },
    include: { segment: true },
    orderBy: { createdAt: 'asc' },
  });

  const adLevel = allInsights.filter(i => !!i.metaAdId);
  const creativeStats = creatives.map((creative, index) => {
    const rows = adLevel.filter(i => i.metaAdId === creative.metaAdId);
    return {
      id: creative.id,
      index,
      metaAdId: creative.metaAdId,
      fileUrl: creative.fileUrl,
      ctaText: creative.ctaText,
      adStatus: creative.adStatus,
      startSec: creative.segment?.startSec ?? null,
      endSec: creative.segment?.endSec ?? null,
      totalSpend: rows.reduce((s, r) => s + r.spend, 0),
      totalImpressions: rows.reduce((s, r) => s + r.impressions, 0),
      totalVideoViews: rows.reduce((s, r) => s + r.videoViews, 0),
      totalOutboundClicks: rows.reduce((s, r) => s + r.outboundClicks, 0),
      avgCtr: rows.length > 0 ? rows.reduce((s, r) => s + r.ctr, 0) / rows.length : 0,
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
      costPerConversion,
    },
    budget: {
      daily: campaign.dailyBudget ?? null,
      todaySpend,
      remaining: campaign.dailyBudget != null ? Math.max(0, campaign.dailyBudget - todaySpend) : null,
    },
    daily,
    adsetBreakdown,
    smartLinkClicks: {
      total: smartLinkTotal,
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
      include: { user: { include: { metaConnection: true } }, audiences: true },
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

    const token = campaign.user?.metaConnection?.accessToken ?? process.env.META_ACCESS_TOKEN;
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

    // Fetch adset daily budgets and store total on the campaign
    let totalDailyBudgetCents = 0;
    for (const aud of campaign.audiences) {
      if (!aud.metaAdSetId) continue;
      try {
        const res = await fetch(
          `https://graph.facebook.com/v22.0/${aud.metaAdSetId}?fields=daily_budget&access_token=${token}`
        );
        if (res.ok) {
          const data = await res.json();
          totalDailyBudgetCents += parseInt(data.daily_budget || '0', 10);
        }
      } catch { /* non-fatal */ }
    }

    await prisma.campaign.update({
      where: { id: params.id },
      data: {
        lastSyncAt: new Date(),
        ...(totalDailyBudgetCents > 0 ? { dailyBudget: totalDailyBudgetCents / 100 } : {}),
      },
    });

    return NextResponse.json({ synced: insights.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
