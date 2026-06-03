import { prisma } from '../prisma';
import { fetchCampaignInsights } from '../../lib/meta-insights';

export async function runInsightsSync(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { user: { include: { metaConnection: true } } },
  });

  // Only sync live campaigns that have a Meta campaign ID
  if (!campaign.metaCampaignId) {
    console.log(`[insights-sync] Campaign ${campaignId} has no metaCampaignId — skipping`);
    return;
  }

  const token =
    campaign.user?.metaConnection?.accessToken ?? process.env.META_ACCESS_TOKEN;

  if (!token) {
    console.log(`[insights-sync] No Meta token for campaign ${campaignId} — skipping`);
    return;
  }

  const insights = await fetchCampaignInsights(campaign.metaCampaignId, token);

  for (const insight of insights) {
    // Use findFirst + create/update pattern to handle nullable fields in unique key
    const existing = await prisma.adInsight.findFirst({
      where: {
        campaignId,
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
          campaignId,
          metaAdSetId: insight.metaAdSetId ?? null,
          metaAdId: insight.metaAdId ?? null,
          date: insight.date,
          ...payload,
        },
      });
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { lastSyncAt: new Date() },
  });

  console.log(
    `[insights-sync] Synced ${insights.length} insight rows for campaign ${campaignId}`,
  );
}
