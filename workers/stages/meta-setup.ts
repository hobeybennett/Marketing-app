import { prisma } from '../prisma';
import * as fs from 'fs';
import * as path from 'path';

const META_API = 'https://graph.facebook.com/v22.0';

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

  if (!adAccountId) throw new Error('No Meta ad account configured — connect Meta in Settings');
  if (!pageId) throw new Error('No Facebook Page configured — connect Meta in Settings');
  if (!pageToken) {
    throw new Error('No Facebook Page Access Token — reconnect Meta in Settings to grant page permissions');
  }

  // Skip campaign creation on retry if we already have a Meta campaign ID
  let metaCampaignId = campaign.metaCampaignId;
  if (!metaCampaignId) {
    const metaCampaign = await metaPost(`/act_${adAccountId}/campaigns`, token, {
      name: `Promohit — ${campaign.artistName} — ${campaign.songTitle}`,
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
  console.log(`[meta-setup] Creating adcreatives for ${campaign.creatives.length} creatives. pageId=${pageId} hasPageToken=${hasPageToken}`);
  for (const creative of campaign.creatives) {
    // Use campaign-level selected copy; fall back to per-creative copy for legacy campaigns
    const copy = selectedCopy ?? creative.adCopies[0];
    if (!copy) continue;
    const videoId = videoIds.get(creative.id);
    if (!videoId) continue;

    const adCreative = await metaPost(`/act_${adAccountId}/adcreatives`, pageToken, {
      name: `${campaign.songTitle} — Clip ${campaign.creatives.indexOf(creative) + 1}`,
      object_story_spec: {
        page_id: pageId,
        video_data: {
          video_id: videoId,
          image_hash: coverImageHash,
          message: copy.primaryText,
          call_to_action: {
            type: 'LISTEN_MUSIC',
            value: { link: `${process.env.NEXTAUTH_URL}/go/${campaignId}` },
          },
        },
      },
    });
    adCreativeIds.set(creative.id, adCreative.id);
  }

  // Some countries (Taiwan, Singapore, …) require a `regional_regulated_categories`
  // declaration to publish ads. Meta's error names the exact value to use, so we
  // self-heal: attempt the ad set, and on that specific error append the named
  // *_UNIVERSAL value and retry. Accumulated across ad sets so later ones start ready.
  const regulatedCategories: string[] = [];
  async function createAdSet(payload: Record<string, unknown>): Promise<any> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const body = regulatedCategories.length
        ? { ...payload, regional_regulated_categories: regulatedCategories }
        : payload;
      try {
        return await metaPost(`/act_${adAccountId}/adsets`, token, body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const match = msg.match(/\b([A-Z]+(?:_[A-Z]+)*_UNIVERSAL)\b/);
        const category = match?.[1];
        if (category && !regulatedCategories.includes(category)) {
          console.log(`[meta-setup] adding regional_regulated_category ${category} and retrying ad set`);
          regulatedCategories.push(category);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Exceeded regional_regulated_categories retries');
  }

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

    const adSet = await createAdSet({
      name: audience.name,
      campaign_id: metaCampaignId,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      // "Highest volume" (no bid cap) — matches the proven campaign. A bid cap on
      // a small daily budget can prevent delivery entirely.
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      daily_budget: Math.round((campaign.dailyBudget ?? 10) / 3 * 100),
      targeting: buildTargeting(audience),
      // Ad sets + ads are created ACTIVE, but the parent campaign stays PAUSED
      // until the very end, so nothing delivers while we're still building it.
      status: 'ACTIVE',
    });

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

async function uploadImageToMeta(filePath: string, token: string, adAccountId: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('source', new Blob([fileBuffer], { type: 'image/jpeg' }), path.basename(filePath));

  const res = await fetch(`https://graph.facebook.com/v22.0/act_${adAccountId}/adimages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Meta image upload failed: ${await res.text()}`);
  const data = await res.json();
  const images = data.images as Record<string, { hash: string }>;
  const hash = images[Object.keys(images)[0]]?.hash;
  if (!hash) throw new Error('Meta image upload returned no hash');
  return hash;
}

async function uploadVideoToMeta(filePath: string, token: string, adAccountId: string, title: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('title', title);
  form.append('source', new Blob([fileBuffer], { type: 'video/mp4' }), path.basename(filePath));

  const res = await fetch(`https://graph.facebook.com/v22.0/act_${adAccountId}/advideos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Meta video upload failed: ${await res.text()}`);
  const data = await res.json();
  const videoId = data.video_id ?? data.id;
  if (!videoId) throw new Error('Meta video upload returned no video ID');
  return String(videoId);
}

async function metaPost(endpoint: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${META_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.error) {
    const e = json?.error;
    // Log full error details to help diagnose Meta API issues
    console.error(`[meta-setup] API error on ${endpoint}:`, JSON.stringify(e ?? json, null, 2));

    // Friendly message for the most common gotcha: Meta app still in dev mode
    if (e?.error_subcode === 1885183) {
      throw new Error('Your Meta app is still in Development mode. Submit it for App Review in the Meta Developer dashboard, or set MOCK_META=true on Railway to test without going live.');
    }

    const msg = e?.error_user_msg || e?.message || JSON.stringify(json);
    const detail = e ? ` (code=${e.code} subcode=${e.error_subcode} type=${e.type})` : '';
    throw new Error(`Meta API error on ${endpoint}: ${msg}${detail}`);
  }

  return json;
}

// Countries where Spotify is available and Meta advertising is permitted without
// additional advertiser-side consent requirements. Excludes: China (Meta blocked),
// Russia (Spotify suspended), and US-sanctioned territories (Cuba, Iran, North Korea, Syria).
const SPOTIFY_MARKETS = [
  // English-speaking
  'US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA',
  // Western Europe
  'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'AT', 'CH', 'BE', 'PT', 'LU', 'IS',
  // Central & Eastern Europe
  'PL', 'CZ', 'HU', 'RO', 'SK', 'HR', 'SI', 'BG', 'EE', 'LV', 'LT', 'GR', 'CY', 'MT',
  'TR', 'UA', 'RS', 'AL', 'BA', 'ME', 'MK', 'MD',
  // Latin America
  'BR', 'MX', 'AR', 'CO', 'CL', 'PE', 'UY', 'CR', 'EC', 'DO', 'GT', 'PA', 'PY', 'HN', 'SV', 'NI', 'BO', 'VE', 'JM', 'TT',
  // Asia-Pacific. Thailand (min age 20) and Indonesia (min age 21) are excluded —
  // a single 18+ ad set can't include them. Taiwan + Singapore ARE included now;
  // their regional_regulated_categories requirement is handled by createAdSet().
  'JP', 'KR', 'SG', 'PH', 'MY', 'IN', 'TW', 'VN', 'HK',
  // Middle East
  'AE', 'SA', 'QA', 'KW', 'OM', 'BH', 'JO', 'EG', 'MA', 'IL', 'TN', 'LB',
  // Africa
  'NG', 'GH', 'KE', 'TZ', 'UG', 'SN', 'CM', 'CI',
  // Caucasus & Central Asia
  'AM', 'GE', 'AZ', 'KZ',
];

function buildTargeting(audience: { type: string; interests: string[] }) {
  const base = { geo_locations: { countries: SPOTIFY_MARKETS }, age_min: 18, age_max: 65 };
  if (audience.type === 'INTEREST') {
    return { ...base, targeting_automation: { advantage_audience: 1 } };
  }
  // RETARGETING and LOOKALIKE require a Meta custom audience — adset creation is
  // skipped for these when dataStatus is PENDING_DATA (no custom audience yet created).
  return base;
}
