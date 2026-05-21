import { prisma } from '../prisma';
import * as fs from 'fs';
import * as path from 'path';

const META_API = 'https://graph.facebook.com/v22.0';

export async function runMetaSetup(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      creatives: { include: { adCopies: true } },
      audiences: true,
      user: { include: { metaConnection: true } },
    },
  });

  // Prefer user's stored Meta connection; fall back to env vars for legacy campaigns
  const metaConn = campaign.user?.metaConnection;
  const token = metaConn?.accessToken ?? process.env.META_ACCESS_TOKEN;
  const adAccountId = metaConn?.adAccountId ?? process.env.META_AD_ACCOUNT_ID;
  const pageId = metaConn?.pageId ?? process.env.META_PAGE_ID;

  if (!token) {
    // Mock mode: no real Meta credentials
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

  if (!adAccountId) throw new Error('No Meta ad account configured — connect Meta in Settings');
  if (!pageId) throw new Error('No Facebook Page configured — connect Meta in Settings');

  // Skip campaign creation on retry if we already have a Meta campaign ID
  let metaCampaignId = campaign.metaCampaignId;
  if (!metaCampaignId) {
    const metaCampaign = await metaPost(`/act_${adAccountId}/campaigns`, token, {
      name: `Hitback — ${campaign.artistName} — ${campaign.songTitle}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      destination_type: 'WEBSITE',
      is_adset_budget_sharing_enabled: false,
    });
    metaCampaignId = metaCampaign.id;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { metaCampaignId },
    });
  }

  // Upload videos and collect video IDs
  const videoIds = new Map<string, string>(); // creativeId -> metaVideoId
  for (const creative of campaign.creatives) {
    if (fs.existsSync(creative.fileUrl)) {
      const videoId = await uploadVideoToMeta(
        creative.fileUrl, token, adAccountId,
        `${campaign.songTitle} — clip ${campaign.creatives.indexOf(creative) + 1}`
      );
      videoIds.set(creative.id, videoId);
    }
  }

  // Create one AdCreative per video creative
  const adCreativeIds = new Map<string, string>(); // creativeId -> metaAdCreativeId
  for (const creative of campaign.creatives) {
    const copy = creative.adCopies[0];
    if (!copy) continue;
    const videoId = videoIds.get(creative.id);
    if (!videoId) continue;

    const adCreative = await metaPost(`/act_${adAccountId}/adcreatives`, token, {
      name: `${campaign.songTitle} — creative ${campaign.creatives.indexOf(creative) + 1}`,
      object_story_spec: {
        page_id: pageId,
        video_data: {
          video_id: videoId,
          title: copy.headline,
          message: copy.primaryText,
          call_to_action: {
            type: 'LISTEN_MUSIC',
            value: { link: `https://hitback.app/c/${campaignId}` },
          },
        },
      },
    });
    adCreativeIds.set(creative.id, adCreative.id);
  }

  for (const audience of campaign.audiences) {
    // Skip adset creation on retry if this audience already has a Meta adset ID
    if (audience.metaAdSetId) {
      console.log(`[meta-setup] Skipping adset creation for ${audience.name} — already exists`);
      continue;
    }

    const adSet = await metaPost(`/act_${adAccountId}/adsets`, token, {
      name: audience.name,
      campaign_id: metaCampaignId,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_amount: 200,
      bid_strategy: 'LOWEST_COST_WITH_BID_CAP',
      daily_budget: 1000,
      targeting: buildTargeting(audience),
      status: 'PAUSED',
    });

    await prisma.audience.update({
      where: { id: audience.id },
      data: { metaAdSetId: adSet.id },
    });

    for (const creative of campaign.creatives) {
      const adCreativeId = adCreativeIds.get(creative.id);
      if (!adCreativeId) continue; // skip if no creative

      await metaPost(`/act_${adAccountId}/ads`, token, {
        name: `${campaign.songTitle} — ${creative.ctaText} — ${audience.name}`,
        adset_id: adSet.id,
        status: 'PAUSED',
        creative: { creative_id: adCreativeId },
      });
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'LIVE' },
  });
}

async function uploadVideoToMeta(filePath: string, token: string, adAccountId: string, title: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('title', title);
  form.append('source', new Blob([fileBuffer], { type: 'video/mp4' }), path.basename(filePath));

  const res = await fetch(`https://graph.facebook.com/v22.0/act_${adAccountId}/advideos?access_token=${token}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Meta video upload failed: ${await res.text()}`);
  const data = await res.json();
  const videoId = data.video_id ?? data.id;
  if (!videoId) throw new Error('Meta video upload returned no video ID');
  return String(videoId);
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
  const base: Record<string, unknown> = {
    geo_locations: { countries: ['US'] },
    age_min: 18,
    age_max: 65,
  };
  if (audience.type === 'INTEREST') {
    // Use Advantage+ audience — Meta's ML optimises delivery without explicit interest IDs
    base.targeting_automation = { advantage_audience: 1 };
  } else {
    console.warn(`[meta-setup] Audience type ${audience.type} uses broad targeting`);
  }
  return base;
}
