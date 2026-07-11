import * as fs from 'fs';
import * as path from 'path';

// Single source of truth for how we build Meta (Facebook/Instagram) ad objects, so
// the production pipeline (workers/stages/meta-setup.ts) and the test harness
// (app/api/admin/test-campaign) produce byte-identical requests. Pure functions on
// primitives — no Prisma coupling.

export const META_API = 'https://graph.facebook.com/v22.0';

// ── Low-level Meta calls ────────────────────────────────────────────────────

export async function metaPost(endpoint: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${META_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.error) {
    const e = json?.error;
    console.error(`[meta] API error on ${endpoint}:`, JSON.stringify(e ?? json, null, 2));

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

export async function uploadImageToMeta(filePath: string, token: string, adAccountId: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('source', new Blob([fileBuffer], { type: 'image/jpeg' }), path.basename(filePath));

  const res = await fetch(`${META_API}/act_${adAccountId}/adimages`, {
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

export async function uploadVideoToMeta(filePath: string, token: string, adAccountId: string, title: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('title', title);
  form.append('source', new Blob([fileBuffer], { type: 'video/mp4' }), path.basename(filePath));

  const res = await fetch(`${META_API}/act_${adAccountId}/advideos`, {
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

// Find or create the "Spotify Click" custom conversion. Our smart-link page fires
// the standard 'Lead' pixel event when someone taps "Listen on Spotify", so the
// custom conversion is defined on that event. Reused per ad account (Meta caps
// custom conversions at 100/account). Returns its id, or null if it can't be set up.
export const SPOTIFY_CLICK_CONVERSION_NAME = 'Promohit Spotify Click';

export async function ensureSpotifyClickConversion(
  adAccountId: string,
  token: string,
  pixelId: string,
  diag?: string[],
): Promise<string | null> {
  try {
    const listRes = await fetch(
      `${META_API}/act_${adAccountId}/customconversions?fields=id,name&limit=100&access_token=${token}`
    );
    const list = await listRes.json();
    if (list.error) {
      diag?.push(`list failed: ${list.error.message} (code ${list.error.code} subcode ${list.error.error_subcode})`);
    } else if (Array.isArray(list.data)) {
      const found = list.data.find((c: { id: string; name: string }) => c.name === SPOTIFY_CLICK_CONVERSION_NAME);
      if (found) {
        diag?.push(`found existing custom conversion ${found.id}`);
        return found.id;
      }
      diag?.push(`no existing "${SPOTIFY_CLICK_CONVERSION_NAME}" among ${list.data.length} custom conversions — creating`);
    }

    const createRes = await fetch(`${META_API}/act_${adAccountId}/customconversions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: SPOTIFY_CLICK_CONVERSION_NAME,
        pixel_id: pixelId,
        custom_event_type: 'OTHER',
        rule: JSON.stringify({ and: [{ event: { eq: 'Lead' } }] }),
        access_token: token,
      }),
    });
    const created = await createRes.json();
    if (created.error) {
      console.warn('[meta] custom conversion create failed:', created.error.message);
      diag?.push(`create failed: ${created.error.message} (code ${created.error.code} subcode ${created.error.error_subcode} type ${created.error.type})`);
      return null;
    }
    diag?.push(`created custom conversion ${created.id}`);
    return created.id ?? null;
  } catch (err) {
    console.warn('[meta] custom conversion setup skipped:', err);
    diag?.push(`exception: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Targeting ───────────────────────────────────────────────────────────────

// Countries where Spotify is available and Meta advertising is permitted without
// additional advertiser-side consent requirements. Excludes: China (Meta blocked),
// Russia (Spotify suspended), and US-sanctioned territories (Cuba, Iran, North Korea, Syria).
export const SPOTIFY_MARKETS = [
  // English-speaking
  'US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA',
  // Western Europe
  'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'AT', 'CH', 'BE', 'PT', 'LU', 'IS',
  // Central & Eastern Europe
  'PL', 'CZ', 'HU', 'RO', 'SK', 'HR', 'SI', 'BG', 'EE', 'LV', 'LT', 'GR', 'CY', 'MT',
  'TR', 'UA', 'RS', 'AL', 'BA', 'ME', 'MK', 'MD',
  // Latin America
  'BR', 'MX', 'AR', 'CO', 'CL', 'PE', 'UY', 'CR', 'EC', 'DO', 'GT', 'PA', 'PY', 'HN', 'SV', 'NI', 'BO', 'VE', 'JM', 'TT',
  // Asia-Pacific. Excluded so a brand-new customer account needs ZERO extra Meta
  // work: Thailand (min age 20), Indonesia (min age 21), and Singapore + Taiwan
  // (both require the advertiser to complete account verification themselves).
  'JP', 'KR', 'PH', 'MY', 'IN', 'VN', 'HK',
  // Middle East
  'AE', 'SA', 'QA', 'KW', 'OM', 'BH', 'JO', 'EG', 'MA', 'IL', 'TN', 'LB',
  // Africa
  'NG', 'GH', 'KE', 'TZ', 'UG', 'SN', 'CM', 'CI',
  // Caucasus & Central Asia
  'AM', 'GE', 'AZ', 'KZ',
];

export function buildTargeting(_audience: { type: string; interests: string[] }): Record<string, unknown> {
  return {
    geo_locations: { countries: SPOTIFY_MARKETS },
    age_min: 18,
    age_max: 65,
    // Manual placements — Instagram only (Feed, Stories, Reels). Specifying
    // publisher_platforms + positions turns OFF Advantage+ (automatic) placements.
    publisher_platforms: ['instagram'],
    instagram_positions: ['stream', 'story', 'reels'],
    // Detailed targeting expansion OFF — keep delivery within our defined audience.
    targeting_automation: { advantage_audience: 0 },
  };
}

// ── Request-body builders ───────────────────────────────────────────────────

// Strict Engagement when we have a custom conversion to optimize for — no Sales
// fallback. Traffic only when there is no pixel/custom conversion at all.
export function buildCampaignObjectives(useConversions: boolean): string[] {
  return useConversions ? ['OUTCOME_ENGAGEMENT'] : ['OUTCOME_TRAFFIC'];
}

export function buildCampaignBody(params: { name: string; objective: string }): Record<string, unknown> {
  return {
    name: params.name,
    objective: params.objective,
    status: 'PAUSED',
    special_ad_categories: [],
    destination_type: 'WEBSITE',
    is_adset_budget_sharing_enabled: false,
  };
}

export function buildAdSetBody(params: {
  name: string;
  campaignId: string;
  useConversions: boolean;
  pixelId: string | null;
  customConversionId: string | null;
  dailyBudgetCents: number;
  audience: { type: string; interests: string[] };
  artistName: string;
}): Record<string, unknown> {
  return {
    name: params.name,
    campaign_id: params.campaignId,
    billing_event: 'IMPRESSIONS',
    // Maximise conversions of the "Spotify Click" custom conversion when we have
    // one; otherwise optimize for Landing Page Views.
    optimization_goal: params.useConversions ? 'OFFSITE_CONVERSIONS' : 'LANDING_PAGE_VIEWS',
    ...(params.useConversions
      ? { promoted_object: { pixel_id: params.pixelId, custom_conversion_id: params.customConversionId } }
      : {}),
    // "Highest volume" (no bid cap).
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: params.dailyBudgetCents,
    targeting: buildTargeting(params.audience),
    // EU/Brazil/etc. DSA transparency — filled in automatically.
    dsa_beneficiary: params.artistName,
    dsa_payor: params.artistName,
    status: 'ACTIVE',
  };
}

export function buildAdCreativeBody(params: {
  name: string;
  pageId: string;
  instagramUserId: string | null;
  videoId: string;
  imageHash: string;
  message: string;
  link: string;
}): Record<string, unknown> {
  return {
    name: params.name,
    object_story_spec: {
      page_id: params.pageId,
      // Run on Instagram as the artist's own IG account when connected.
      ...(params.instagramUserId ? { instagram_user_id: params.instagramUserId } : {}),
      video_data: {
        video_id: params.videoId,
        image_hash: params.imageHash,
        message: params.message,
        call_to_action: {
          type: 'LISTEN_MUSIC',
          value: { link: params.link },
        },
      },
    },
    // No Advantage+ creative: as of Marketing API v22.0 enhancements are opt-IN per
    // feature, so including nothing means none are applied.
  };
}

// The regional_regulated_categories self-heal wrapper. Some countries (Taiwan,
// Singapore, …) require a regional_regulated_categories value; Meta's error names
// the exact one, so we append it and retry. Accumulates across ad sets.
export function makeCreateAdSet(adAccountId: string, token: string) {
  const regulatedCategories: string[] = [];
  return async function createAdSet(payload: Record<string, unknown>): Promise<{ id: string }> {
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
          console.log(`[meta] adding regional_regulated_category ${category} and retrying ad set`);
          regulatedCategories.push(category);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Exceeded regional_regulated_categories retries');
  };
}
