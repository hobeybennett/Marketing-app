import { prisma } from '../prisma';
import { fetchCampaignInsights, storeInsights } from '../../lib/meta-insights';

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
  await storeInsights(prisma, campaignId, insights);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { lastSyncAt: new Date() },
  });

  console.log(
    `[insights-sync] Synced ${insights.length} insight rows for campaign ${campaignId}`,
  );
}
