import type { PrismaClient } from '@prisma/client';

const META_API = 'https://graph.facebook.com/v22.0';

export interface MetaInsightRow {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  cpm: string;
  ctr: string;
  cpc: string;
  outbound_clicks?: { action_type: string; value: string }[];
  video_p25_watched_actions?: { action_type: string; value: string }[];
  adset_id?: string;
  ad_id?: string;
}

export interface NormalisedInsight {
  date: Date;
  spend: number;
  impressions: number;
  cpm: number;
  ctr: number;
  cpc: number;
  outboundClicks: number;
  videoViews: number;
  metaAdSetId?: string;
  metaAdId?: string;
}

export type InsightLevel = 'campaign' | 'adset' | 'ad';

async function fetchInsights(
  objectId: string,
  token: string,
  level: InsightLevel,
  datePreset = 'maximum',
): Promise<MetaInsightRow[]> {
  const fields = [
    'spend',
    'impressions',
    'cpm',
    'ctr',
    'cpc',
    'outbound_clicks',
    'video_p25_watched_actions',
    'date_start',
    'date_stop',
    // Without these, adset/ad rows come back with no level id, collapse onto the
    // campaign row (overwriting the real total), and get triple-counted in sums.
    'adset_id',
    'ad_id',
  ].join(',');

  const params = new URLSearchParams({
    access_token: token,
    fields,
    level,
    date_preset: datePreset,   // all-time, matches Ads Manager "Maximum"
    time_increment: '1',
    limit: '500',
  });

  // Follow pagination so we get every daily row, not just the first page.
  let url: string | null = `${META_API}/${objectId}/insights?${params.toString()}`;
  const rows: MetaInsightRow[] = [];
  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meta Insights API error (${level}): ${text}`);
    }
    const data = await res.json();
    rows.push(...((data.data as MetaInsightRow[]) ?? []));
    url = data.paging?.next ?? null;
  }
  return rows;
}

function normalise(row: MetaInsightRow): NormalisedInsight {
  const outboundClicks =
    row.outbound_clicks?.reduce((s, a) => s + Number(a.value || 0), 0) ?? 0;
  const videoViews =
    row.video_p25_watched_actions?.reduce((s, a) => s + Number(a.value || 0), 0) ?? 0;

  return {
    date: new Date(row.date_start),
    spend: parseFloat(row.spend || '0'),
    impressions: parseInt(row.impressions || '0', 10),
    cpm: parseFloat(row.cpm || '0'),
    ctr: parseFloat(row.ctr || '0'),
    cpc: parseFloat(row.cpc || '0'),
    outboundClicks,
    videoViews,
    metaAdSetId: row.adset_id,
    metaAdId: row.ad_id,
  };
}

export async function fetchCampaignInsights(
  metaCampaignId: string,
  token: string,
): Promise<NormalisedInsight[]> {
  if (!token) throw new Error('No Meta credentials');

  const [campaignRows, adsetRows, adRows] = await Promise.all([
    fetchInsights(metaCampaignId, token, 'campaign'),
    fetchInsights(metaCampaignId, token, 'adset'),
    fetchInsights(metaCampaignId, token, 'ad'),
  ]);

  return [
    ...campaignRows.map(normalise),
    ...adsetRows.map(normalise),
    ...adRows.map(normalise),
  ];
}

// Persist insights with a clean full replace. date_preset=maximum returns the
// whole history each sync, so replacing is correct and self-heals any rows
// corrupted by the old (level-less) storage. Accepts the caller's PrismaClient
// (web and worker each have their own singleton).
export async function storeInsights(
  prisma: PrismaClient,
  campaignId: string,
  insights: NormalisedInsight[],
): Promise<void> {
  // Nothing came back (transient/empty) — keep existing data rather than wiping it.
  if (insights.length === 0) return;

  await prisma.$transaction([
    prisma.adInsight.deleteMany({ where: { campaignId } }),
    prisma.adInsight.createMany({
      data: insights.map((i) => ({
        campaignId,
        metaAdSetId: i.metaAdSetId ?? null,
        metaAdId: i.metaAdId ?? null,
        date: i.date,
        spend: i.spend,
        impressions: i.impressions,
        cpm: i.cpm,
        ctr: i.ctr,
        cpc: i.cpc,
        outboundClicks: i.outboundClicks,
        videoViews: i.videoViews,
      })),
    }),
  ]);
}
