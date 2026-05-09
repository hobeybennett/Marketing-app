import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const META_API = 'https://graph.facebook.com/v19.0';

export async function runMetaSetup(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      creatives: { include: { adCopies: true } },
      audiences: true,
    },
  });

  if (!process.env.META_ACCESS_TOKEN) {
    console.log(`[meta-setup] Mock mode for campaign ${campaignId}`);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'LIVE',
        metaCampaignId: `mock_campaign_${campaignId.slice(0, 8)}`,
      },
    });
    return;
  }

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID!;

  const metaCampaign = await metaPost(`/act_${adAccountId}/campaigns`, token, {
    name: `Hitback — ${campaign.artistName} — ${campaign.songTitle}`,
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: [],
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { metaCampaignId: metaCampaign.id },
  });

  for (const audience of campaign.audiences) {
    const adSet = await metaPost(`/act_${adAccountId}/adsets`, token, {
      name: audience.name,
      campaign_id: metaCampaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_amount: 200,
      daily_budget: 1000,
      targeting: buildTargeting(audience),
      status: 'PAUSED',
    });

    await prisma.audience.update({
      where: { id: audience.id },
      data: { metaAdSetId: adSet.id },
    });

    for (const creative of campaign.creatives) {
      const copy = creative.adCopies[0];
      if (!copy) continue;

      await metaPost(`/act_${adAccountId}/ads`, token, {
        name: `${campaign.songTitle} — ${creative.ctaText}`,
        adset_id: adSet.id,
        status: 'PAUSED',
        creative: {
          title: copy.headline,
          body: copy.primaryText,
          link_url: `https://hitback.app/c/${campaignId}`,
          call_to_action_type: 'LISTEN_NOW',
        },
      });
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'LIVE' },
  });
}

async function metaPost(endpoint: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${META_API}${endpoint}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error on ${endpoint}: ${err}`);
  }

  return res.json();
}

function buildTargeting(audience: { type: string; interests: string[] }) {
  const base = { geo_locations: { countries: ['US'] } };
  if (audience.type === 'INTEREST' && audience.interests.length > 0) {
    return { ...base, interests: audience.interests.map((name) => ({ name })) };
  }
  return base;
}
