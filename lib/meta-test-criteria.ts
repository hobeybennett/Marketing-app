import { SPOTIFY_MARKETS, SPOTIFY_CLICK_CONVERSION_NAME } from './meta-campaign';

// The spec every built campaign must match, expressed as tolerant predicates that
// run against the objects we read *back* from Meta. Set-compares for arrays,
// coercion for numbers, absence checks — never a deep-equal of Meta's whole blob
// (Meta echoes back many derived/normalised fields we don't set).

export type CriterionLevel = 'Campaign' | 'Ad set' | 'Creative' | 'Ad';

export type CriterionContext = {
  useConversions: boolean;
  pixelId: string | null;
  customConversionId: string | null;
  pageId: string;
  instagramUserId: string | null;
  chosenObjective: string | null;
};

export type CriterionResult = {
  name: string;
  level: CriterionLevel;
  expected: string;
  actual: string;
  pass: boolean;
};

export type Criterion = {
  name: string;
  level: CriterionLevel;
  // Which read-back object this criterion inspects.
  source: 'campaign' | 'adset' | 'creative' | 'ad';
  describeExpected: (ctx: CriterionContext) => string;
  // Return [pass, humanReadableActual].
  evaluate: (obj: any, ctx: CriterionContext) => [boolean, string];
};

// ── helpers ───────────────────────────────────────────────────────────────

function sameSet(a: unknown, b: unknown): boolean {
  const arrA = Array.isArray(a) ? a.map(String) : [];
  const arrB = Array.isArray(b) ? b.map(String) : [];
  if (arrA.length !== arrB.length) return false;
  const setB = new Set(arrB);
  return arrA.every((x) => setB.has(x));
}

function show(v: unknown): string {
  if (v === undefined) return '(absent)';
  if (v === null) return '(null)';
  if (Array.isArray(v)) return `[${v.map(String).join(', ')}]`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ── criteria ────────────────────────────────────────────────────────────────

export const CRITERIA: Criterion[] = [
  {
    name: 'Objective',
    level: 'Campaign',
    source: 'campaign',
    describeExpected: (ctx) => (ctx.useConversions ? 'OUTCOME_ENGAGEMENT' : 'OUTCOME_TRAFFIC'),
    evaluate: (c, ctx) => {
      const want = ctx.useConversions ? 'OUTCOME_ENGAGEMENT' : 'OUTCOME_TRAFFIC';
      return [c?.objective === want, show(c?.objective)];
    },
  },
  {
    name: 'Special ad category',
    level: 'Campaign',
    source: 'campaign',
    describeExpected: () => 'none ([] or [NONE])',
    evaluate: (c) => {
      const cats: string[] = Array.isArray(c?.special_ad_categories) ? c.special_ad_categories : [];
      const ok = cats.length === 0 || (cats.length === 1 && cats[0] === 'NONE');
      return [ok, show(c?.special_ad_categories)];
    },
  },
  {
    name: 'Buying type',
    level: 'Campaign',
    source: 'campaign',
    describeExpected: () => 'AUCTION',
    evaluate: (c) => {
      // buying_type defaults to AUCTION when unset; treat absent as AUCTION.
      const bt = c?.buying_type ?? 'AUCTION';
      return [bt === 'AUCTION', show(c?.buying_type ?? '(default AUCTION)')];
    },
  },
  {
    name: 'Conversion location',
    level: 'Ad set',
    source: 'adset',
    describeExpected: () => 'destination_type = WEBSITE',
    evaluate: (a) => [a?.destination_type === 'WEBSITE', show(a?.destination_type)],
  },
  {
    name: 'Optimization goal',
    level: 'Ad set',
    source: 'adset',
    describeExpected: (ctx) => (ctx.useConversions ? 'OFFSITE_CONVERSIONS' : 'LANDING_PAGE_VIEWS'),
    evaluate: (a, ctx) => {
      const want = ctx.useConversions ? 'OFFSITE_CONVERSIONS' : 'LANDING_PAGE_VIEWS';
      return [a?.optimization_goal === want, show(a?.optimization_goal)];
    },
  },
  {
    name: 'Conversion event',
    level: 'Ad set',
    source: 'adset',
    describeExpected: (ctx) =>
      ctx.useConversions ? `custom_conversion "${SPOTIFY_CLICK_CONVERSION_NAME}"` : 'none (no custom conversion)',
    evaluate: (a, ctx) => {
      const cc = a?.promoted_object?.custom_conversion_id ?? null;
      if (!ctx.useConversions) return [cc === null, show(cc)];
      return [!!cc && (!ctx.customConversionId || String(cc) === String(ctx.customConversionId)), show(cc)];
    },
  },
  {
    name: 'Dataset / pixel',
    level: 'Ad set',
    source: 'adset',
    describeExpected: (ctx) => (ctx.useConversions ? `pixel_id = ${ctx.pixelId ?? '(set)'}` : 'none'),
    evaluate: (a, ctx) => {
      const px = a?.promoted_object?.pixel_id ?? null;
      if (!ctx.useConversions) return [px === null, show(px)];
      return [!!px && (!ctx.pixelId || String(px) === String(ctx.pixelId)), show(px)];
    },
  },
  {
    name: 'Bid strategy',
    level: 'Ad set',
    source: 'adset',
    describeExpected: () => 'LOWEST_COST_WITHOUT_CAP (Highest volume)',
    evaluate: (a) => [a?.bid_strategy === 'LOWEST_COST_WITHOUT_CAP', show(a?.bid_strategy)],
  },
  {
    name: 'Placements — platform',
    level: 'Ad set',
    source: 'adset',
    describeExpected: () => "publisher_platforms = ['instagram']",
    evaluate: (a) => [sameSet(a?.targeting?.publisher_platforms, ['instagram']), show(a?.targeting?.publisher_platforms)],
  },
  {
    name: 'Placements — positions',
    level: 'Ad set',
    source: 'adset',
    describeExpected: () => "instagram_positions = ['stream','story','reels']",
    evaluate: (a) => [
      sameSet(a?.targeting?.instagram_positions, ['stream', 'story', 'reels']),
      show(a?.targeting?.instagram_positions),
    ],
  },
  {
    name: 'Advantage audience',
    level: 'Ad set',
    source: 'adset',
    describeExpected: () => 'targeting_automation.advantage_audience = 0 (OFF)',
    evaluate: (a) => {
      const v = a?.targeting?.targeting_automation?.advantage_audience;
      // Meta may omit it when 0; treat absent as 0/off.
      const ok = v === undefined || Number(v) === 0;
      return [ok, show(v ?? '(absent → 0)')];
    },
  },
  {
    name: 'Age range',
    level: 'Ad set',
    source: 'adset',
    describeExpected: () => '18–65',
    evaluate: (a) => {
      const ok = Number(a?.targeting?.age_min) === 18 && Number(a?.targeting?.age_max) === 65;
      return [ok, `${show(a?.targeting?.age_min)}–${show(a?.targeting?.age_max)}`];
    },
  },
  {
    name: 'Countries',
    level: 'Ad set',
    source: 'adset',
    describeExpected: () => `SPOTIFY_MARKETS (${SPOTIFY_MARKETS.length} countries)`,
    evaluate: (a) => {
      const got = a?.targeting?.geo_locations?.countries;
      return [sameSet(got, SPOTIFY_MARKETS), `${Array.isArray(got) ? got.length : 0} countries`];
    },
  },
  {
    name: 'Facebook Page',
    level: 'Creative',
    source: 'creative',
    describeExpected: (ctx) => `page_id = ${ctx.pageId}`,
    evaluate: (cr, ctx) => {
      const pid = cr?.object_story_spec?.page_id ?? null;
      return [String(pid) === String(ctx.pageId), show(pid)];
    },
  },
  {
    name: 'Instagram account',
    level: 'Creative',
    source: 'creative',
    describeExpected: (ctx) =>
      ctx.instagramUserId ? `instagram_user_id = ${ctx.instagramUserId}` : 'none (Page identity)',
    evaluate: (cr, ctx) => {
      const ig = cr?.object_story_spec?.instagram_user_id ?? cr?.instagram_user_id ?? null;
      if (!ctx.instagramUserId) return [ig === null, show(ig)];
      return [String(ig) === String(ctx.instagramUserId), show(ig)];
    },
  },
  {
    name: 'Advantage+ creative',
    level: 'Creative',
    source: 'creative',
    describeExpected: () => 'OFF (no enrolled enhancements)',
    evaluate: (cr) => {
      // We never opt into enhancements. Meta returns a degrees_of_freedom_spec with
      // everything OPT_OUT (or omits it). Pass if absent or all features opted out.
      const spec = cr?.degrees_of_freedom_spec?.creative_features_spec;
      if (!spec) return [true, '(none)'];
      const enrolled = Object.entries(spec)
        .filter(([, v]: [string, any]) => v?.enroll_status === 'OPT_IN')
        .map(([k]) => k);
      return [enrolled.length === 0, enrolled.length ? `opted-in: ${enrolled.join(', ')}` : '(all opt-out)'];
    },
  },
  {
    name: 'CTA',
    level: 'Creative',
    source: 'creative',
    describeExpected: () => 'LISTEN_MUSIC',
    evaluate: (cr) => {
      const cta = cr?.object_story_spec?.video_data?.call_to_action?.type ?? null;
      return [cta === 'LISTEN_MUSIC', show(cta)];
    },
  },
];

export function evaluateCriteria(
  readback: { campaign: any; adset: any; creative: any; ad: any },
  ctx: CriterionContext,
): { results: CriterionResult[]; overall: boolean } {
  const results = CRITERIA.map((c) => {
    const obj = readback[c.source];
    let pass = false;
    let actual = '(no data)';
    try {
      [pass, actual] = c.evaluate(obj, ctx);
    } catch (err) {
      pass = false;
      actual = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    return { name: c.name, level: c.level, expected: c.describeExpected(ctx), actual, pass };
  });
  return { results, overall: results.every((r) => r.pass) };
}
