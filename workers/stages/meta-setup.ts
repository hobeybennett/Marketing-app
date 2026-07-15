import { prisma } from '../prisma';
import * as fs from 'fs';
import {
  metaPost,
  uploadVideoToMeta,
  uploadImageToMeta,
  ensureSpotifyClickConversion,
  buildCampaignObjectives,
  buildCampaignBody,
  buildAdSetBody,
  buildAdCreativeBody,
  makeCreateAdSet,
  resolveInterests,
} from '../../lib/meta-campaign';

export async function runMetaSetup(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      creatives: { include: { adCopies: true } },
      adCopies: true,
      audiences: true,
      user: { include: { metaConnection: true } },
    },
  });

  // Prefer user's stored Meta connection; fall back to env vars for legacy campaigns
  const metaConn = campaign.user?.metaConnection;
  const token = metaConn?.accessToken ?? process.env.META_ACCESS_TOKEN;
  // Page Access Token is required for object_story_spec ad creatives; fall back to user token
  const pageToken = metaConn?.pageAccessToken ?? token;
  const adAccountId = metaConn?.adAccountId ?? process.env.META_AD_ACCOUNT_ID;
  const pageId = metaConn?.pageId ?? process.env.META_PAGE_ID;
  const pixelId = metaConn?.pixelId ?? process.env.META_PIXEL_ID;
  // Only run ads under the artist's Instagram identity when Instagram is fully
  // enabled (opt-in flag). Attaching instagram_user_id when the ad account isn't
  // linked to that IG account makes Meta reject the ad creative (subcode 1815199),
  // so default to the Page identity until it's set up.
  const instagramUserId = process.env.META_ENABLE_INSTAGRAM_SCOPE === 'true'
    ? (metaConn?.instagramUserId ?? null)
    : null;

  // MOCK_META=true bypasses all real API calls — useful while awaiting Meta approval
  const forceMock = process.env.MOCK_META === 'true';

  if (!token || forceMock) {
    const reason = forceMock ? 'MOCK_META=true' : 'no token';
    console.log(`[meta-setup] Mock mode for campaign ${campaignId} (${reason})`);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'LIVE',
        metaCampaignId: `mock_campaign_${campaignId.slice(0, 8)}`,
      },
    });
    return;
  }

  // Optimize for the Spotify-click custom conversion (Hypeddit/Spiration-style).
  // Find or create it; if we have one, run conversion optimization, else fall back
  // to Traffic + Landing Page Views.
  const customConversionId = pixelId && adAccountId && token
    ? await ensureSpotifyClickConversion(adAccountId, token, pixelId)
    : null;
  const useConversions = !!customConversionId;

  if (!adAccountId) throw new Error('No Meta ad account configured — connect Meta in Settings');
  if (!pageId) throw new Error('No Facebook Page configured — connect Meta in Settings');
  if (!pageToken) {
    throw new Error('No Facebook Page Access Token — reconnect Meta in Settings to grant page permissions');
  }

  // Skip campaign creation on retry if we already have a Meta campaign ID
  let metaCampaignId = campaign.metaCampaignId;
  if (!metaCampaignId) {
    // Strict Engagement when we have a custom conversion (no Sales fallback);
    // Traffic only when there's no custom conversion to optimize on.
    const objectives = buildCampaignObjectives(useConversions);
    let metaCampaign: { id: string } | null = null;
    let lastErr: unknown = null;
    for (const objective of objectives) {
      try {
        metaCampaign = await metaPost(
          `/act_${adAccountId}/campaigns`,
          token,
          buildCampaignBody({ name: `Promohit — ${campaign.artistName} — ${campaign.songTitle}`, objective }),
        );
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`[meta-setup] objective ${objective} rejected:`, err instanceof Error ? err.message : err);
      }
    }
    if (!metaCampaign) throw lastErr ?? new Error('Failed to create Meta campaign');
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

  // Upload cover art once for use as video thumbnail across all creatives
  const coverImageHash = await uploadImageToMeta(campaign.coverArtUrl, token, adAccountId);

  // Resolve the ad copy to use across all creatives.
  // New campaigns: campaign-level copies with isSelected flag.
  // Legacy campaigns: per-creative copies as fallback.
  const campaignCopies = (campaign as any).adCopies as Array<{ isSelected: boolean; primaryText: string; creativeId: string | null }> | undefined;
  const selectedCopy = campaignCopies?.find(c => c.isSelected && c.creativeId === null)
    ?? campaignCopies?.find(c => c.creativeId === null)
    ?? null;

  // Create one AdCreative per video creative
  const adCreativeIds = new Map<string, string>(); // creativeId -> metaAdCreativeId
  const hasPageToken = !!(metaConn?.pageAccessToken);
  console.log(`[meta-setup] Creating adcreatives for ${campaign.creatives.length} creatives. pageId=${pageId} igUserId=${instagramUserId} hasPageToken=${hasPageToken}`);
  for (const creative of campaign.creatives) {
    // Use campaign-level selected copy; fall back to per-creative copy for legacy campaigns
    const copy = selectedCopy ?? creative.adCopies[0];
    if (!copy) continue;
    const videoId = videoIds.get(creative.id);
    if (!videoId) continue;

    const creativeParams = {
      name: `${campaign.songTitle} — Clip ${campaign.creatives.indexOf(creative) + 1}`,
      pageId,
      videoId,
      imageHash: coverImageHash,
      message: copy.primaryText,
      link: `${process.env.NEXTAUTH_URL}/go/${campaignId}`,
    };
    let adCreative;
    try {
      adCreative = await metaPost(
        `/act_${adAccountId}/adcreatives`,
        pageToken,
        buildAdCreativeBody({ ...creativeParams, instagramUserId }),
      );
    } catch (err) {
      // If the ad account isn't linked to the chosen IG account, fall back to the
      // Page identity rather than failing the whole campaign.
      const msg = err instanceof Error ? err.message : String(err);
      if (instagramUserId && (msg.includes('1815199') || /access to this Instagram account/i.test(msg))) {
        console.warn('[meta-setup] IG account not accessible to ad account — retrying creative without instagram_user_id');
        adCreative = await metaPost(
          `/act_${adAccountId}/adcreatives`,
          pageToken,
          buildAdCreativeBody({ ...creativeParams, instagramUserId: null }),
        );
      } else {
        throw err;
      }
    }
    adCreativeIds.set(creative.id, adCreative.id);
  }

  const createAdSet = makeCreateAdSet(adAccountId, token);

  // Split the daily budget across the ad sets that will actually run (PENDING_DATA
  // audiences are skipped). With a single interest audience this is the full budget.
  const adSetCount = Math.max(
    campaign.audiences.filter((a) => (a as any).dataStatus !== 'PENDING_DATA').length,
    1,
  );

  for (const audience of campaign.audiences) {
    // Skip adset creation on retry if this audience already has a Meta adset ID
    if (audience.metaAdSetId) {
      console.log(`[meta-setup] Skipping adset creation for ${audience.name} — already exists`);
      continue;
    }

    // Skip audiences with insufficient data (retargeting/lookalike not yet ready)
    if ((audience as any).dataStatus === 'PENDING_DATA') {
      console.log(`[meta-setup] Skipping adset for ${audience.name} — data status PENDING_DATA`);
      continue;
    }

    // Resolve similar-artist / genre names into Meta interest IDs so we target
    // fans of those artists instead of running pure-broad. Falls back to broad
    // if none resolve. INTEREST audiences only.
    const interests = audience.type === 'INTEREST' && audience.interests.length
      ? await resolveInterests(audience.interests, token)
      : [];
    if (interests.length) {
      console.log(`[meta-setup] Resolved ${interests.length} interests for ${audience.name}: ${interests.map((i) => i.name).join(', ')}`);
    }

    const adSet = await createAdSet(buildAdSetBody({
      name: audience.name,
      campaignId: metaCampaignId,
      useConversions,
      pixelId: pixelId ?? null,
      customConversionId,
      dailyBudgetCents: Math.round((campaign.dailyBudget ?? 10) / adSetCount * 100),
      audience,
      interests,
      artistName: campaign.artistName,
    }));

    await prisma.audience.update({
      where: { id: audience.id },
      data: { metaAdSetId: adSet.id },
    });

    for (const creative of campaign.creatives) {
      const adCreativeId = adCreativeIds.get(creative.id);
      if (!adCreativeId) continue; // skip if no creative

      const clipNum = campaign.creatives.indexOf(creative) + 1;
      await metaPost(`/act_${adAccountId}/ads`, token, {
        name: `${campaign.songTitle} — Clip ${clipNum} — ${audience.name}`,
        adset_id: adSet.id,
        status: 'ACTIVE',
        creative: { creative_id: adCreativeId },
      });
    }
  }

  // Everything is built (ad sets + ads ACTIVE under a still-PAUSED campaign).
  // Flip the campaign to ACTIVE last so delivery starts atomically — this is
  // what actually makes the ads run and spend the daily budget.
  await metaPost(`/${metaCampaignId}`, token, { status: 'ACTIVE' });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'LIVE' },
  });
}
