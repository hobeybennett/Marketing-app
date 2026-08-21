import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { SPOTIFY_CLICK_CONVERSION_NAME, SPOTIFY_CLICK_EVENT } from '@/lib/meta-campaign';
import { extractTrackId, getSpotifyToken } from '@/lib/spotify';

export const dynamic = 'force-dynamic';
const META = 'https://graph.facebook.com/v22.0';

// Phone-friendly, READ-ONLY check of whether the Meta pixel + "Promohit Spotify
// Click" custom conversion are actually firing — shown next to our own
// first-party click count so the two numbers can be reconciled.
//   /api/debug/conversion-status            → most recent live campaign
//   /api/debug/conversion-status?campaign=<id>
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaignId = req.nextUrl.searchParams.get('campaign');
  const select = {
    id: true,
    songTitle: true,
    metaCampaignId: true,
    spotifyUrl: true,
    user: { select: { metaConnection: { select: { pixelId: true, adAccountId: true, accessToken: true } } } },
  } as const;

  const campaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId }, select })
    : await prisma.campaign.findFirst({
        where: { user: { email: 'hobeybennett@gmail.com' }, metaCampaignId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select,
      });

  if (!campaign) return NextResponse.json({ error: 'No live campaign found' }, { status: 404 });

  const conn = campaign.user?.metaConnection;
  const pixelId = conn?.pixelId ?? null;
  const adAccountId = conn?.adAccountId ?? null;
  const token = conn?.accessToken ?? null;

  // Our own first-party click counts for this campaign.
  const [spotify, playlist, pageViews, total] = await Promise.all([
    prisma.smartLinkClick.count({ where: { campaignId: campaign.id, platform: 'spotify' } }),
    prisma.smartLinkClick.count({ where: { campaignId: campaign.id, platform: 'spotify_playlist' } }),
    prisma.smartLinkClick.count({ where: { campaignId: campaign.id, platform: 'page_view' } }),
    prisma.smartLinkClick.count({ where: { campaignId: campaign.id } }),
  ]);

  // Where the traffic actually came from. A conversion can only be credited to
  // an ad if the visitor arrived via an ad click — which Meta marks with an
  // fbclid on the landing URL, captured here in the click's referer. Clicks
  // without one are organic/shared traffic and will NEVER appear in Ads Manager,
  // no matter how correct the pixel setup is.
  const recentClicks = await prisma.smartLinkClick.findMany({
    where: { campaignId: campaign.id, platform: { in: ['spotify', 'spotify_playlist'] } },
    select: { referrer: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const fromAd = recentClicks.filter((c) => (c.referrer ?? '').includes('fbclid')).length;
  const referrerHosts: Record<string, number> = {};
  for (const c of recentClicks) {
    let host = 'direct/none';
    try { if (c.referrer) host = new URL(c.referrer).host; } catch { host = 'unparseable'; }
    referrerHosts[host] = (referrerHosts[host] ?? 0) + 1;
  }

  const out: Record<string, unknown> = {
    campaign: campaign.songTitle,
    attribution: {
      conversionsSampled: recentClicks.length,
      arrivedViaAdClick: fromAd,
      noAdClickId: recentClicks.length - fromAd,
      referrerHosts,
      note:
        'arrivedViaAdClick counts conversions whose visitor carried an fbclid (a real ad click). ' +
        'If this is 0, Meta has nothing to attribute the conversions to and Ads Manager will ' +
        'correctly show zero — the traffic is not coming from the ads.',
    },
    firstParty: {
      spotifyClicks: spotify,
      playlistClicks: playlist,
      pageViews,
      total,
      note: 'What Promohit recorded directly — every tap on Listen on Spotify.',
    },
  };

  // Detailed Spotify popularity probe — shows exactly where the fetch breaks,
  // and seeds today's snapshot when it works so the dashboard chart has a point.
  const probe: Record<string, unknown> = {};
  try {
    probe.existingSnapshots = await prisma.popularitySnapshot.count({ where: { campaignId: campaign.id } });
    probe.spotifyUrl = campaign.spotifyUrl ?? null;
    const trackId = campaign.spotifyUrl ? extractTrackId(campaign.spotifyUrl) : null;
    probe.extractedTrackId = trackId;
    probe.credsSet = !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET;

    if (trackId && probe.credsSet) {
      const token = await getSpotifyToken();
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const t = await (await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, auth)).json().catch(() => null);
      const tm = await (await fetch(`https://api.spotify.com/v1/tracks/${trackId}?market=US`, auth)).json().catch(() => null);
      probe.trackPopularity = typeof t?.popularity === 'number' ? t.popularity : null;
      probe.trackUSPopularity = typeof tm?.popularity === 'number' ? tm.popularity : null;
      const artistId = t?.artists?.[0]?.id ?? tm?.artists?.[0]?.id ?? null;
      probe.artistId = artistId;
      if (artistId) {
        const a = await (await fetch(`https://api.spotify.com/v1/artists/${artistId}`, auth)).json().catch(() => null);
        probe.artistPopularity = typeof a?.popularity === 'number' ? a.popularity : null;
        probe.artistFollowers = a?.followers?.total ?? null;
      }
      const chosen = (probe.trackPopularity ?? probe.trackUSPopularity ?? probe.artistPopularity ?? null) as number | null;
      probe.liveScore = chosen;
      if (chosen != null) {
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        await prisma.popularitySnapshot.upsert({
          where: { campaignId_date: { campaignId: campaign.id, date: day } },
          create: { campaignId: campaign.id, date: day, popularity: chosen },
          update: { popularity: chosen },
        });
        probe.seededToday = true;
        probe.note = 'Seeded — reload the campaign Insights page to see the Popularity chart.';
      } else {
        probe.note = 'Neither track nor artist popularity was returned by Spotify.';
      }
    } else {
      probe.note = !trackId ? 'Could not extract a track id from the Spotify URL.' : 'SPOTIFY_CLIENT_ID/SECRET not set on this service.';
    }
  } catch (err) {
    probe.exception = err instanceof Error ? err.message : String(err);
  }
  out.popularity = probe;

  const ago = (t?: string) => {
    if (!t) return 'never';
    const mins = Math.round((Date.now() - new Date(t).getTime()) / 60000);
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
    return `${Math.round(mins / 1440)} d ago`;
  };

  if (!pixelId || !adAccountId || !token) {
    out.meta = { error: 'No pixel, ad account, or token on the Meta connection.' };
    return NextResponse.json(out);
  }

  // Pixel: has it received ANY event recently?
  try {
    const px = await (await fetch(`${META}/${pixelId}?fields=name,last_fired_time&access_token=${token}`)).json();
    out.pixel = px.error
      ? { error: px.error.message }
      : { name: px.name, lastFired: ago(px.last_fired_time), lastFiredRaw: px.last_fired_time ?? null };
  } catch (e) {
    out.pixel = { error: e instanceof Error ? e.message : String(e) };
  }

  // The custom conversion: has IT fired (i.e. is the PromohitSpotifyClick event matching)?
  try {
    const list = await (await fetch(
      `${META}/act_${adAccountId}/customconversions?fields=id,name,last_fired_time&limit=100&access_token=${token}`
    )).json();
    if (list.error) {
      out.customConversion = { error: list.error.message };
    } else {
      const found = (list.data ?? []).find((c: { name: string }) => c.name === SPOTIFY_CLICK_CONVERSION_NAME);
      out.customConversion = found
        ? { id: found.id, name: found.name, lastFired: ago(found.last_fired_time), lastFiredRaw: found.last_fired_time ?? null }
        : { error: `No "${SPOTIFY_CLICK_CONVERSION_NAME}" custom conversion found on the account.` };
    }
  } catch (e) {
    out.customConversion = { error: e instanceof Error ? e.message : String(e) };
  }

  // What the campaign is actually OPTIMISING for. Even with the pixel firing
  // perfectly, Meta only reports (and optimises toward) conversions when the ad
  // set asked for them — a campaign built as Traffic / Landing Page Views will
  // always show zero conversions no matter what the pixel receives.
  if (campaign.metaCampaignId && !campaign.metaCampaignId.startsWith('mock_')) {
    try {
      const camp = await (await fetch(
        `${META}/${campaign.metaCampaignId}?fields=name,objective,status&access_token=${token}`
      )).json();
      const sets = await (await fetch(
        `${META}/${campaign.metaCampaignId}/adsets?fields=name,status,optimization_goal,promoted_object,daily_budget&limit=25&access_token=${token}`
      )).json();
      out.optimisation = {
        objective: camp.error ? `error: ${camp.error.message}` : camp.objective,
        campaignStatus: camp.error ? null : camp.status,
        adSets: sets.error
          ? `error: ${sets.error.message}`
          : (sets.data ?? []).map((s: any) => ({
              name: s.name,
              status: s.status,
              optimizationGoal: s.optimization_goal,
              promotedObject: s.promoted_object ?? null,
              dailyBudget: s.daily_budget ? `${(Number(s.daily_budget) / 100).toFixed(2)}` : null,
            })),
        note:
          'optimizationGoal OFFSITE_CONVERSIONS + a promotedObject custom_conversion_id means it is ' +
          'optimising for Spotify clicks. LANDING_PAGE_VIEWS means it fell back to Traffic and Meta ' +
          'will never report conversions for it.',
      };
    } catch (e) {
      out.optimisation = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // What Meta has actually ATTRIBUTED to these ads. This is the number the
  // "Promohit Spotify Click" column in Ads Manager would show — fetching it
  // here avoids needing to add that column (custom conversions are hidden by
  // default, which is itself a common reason this looks broken).
  if (campaign.metaCampaignId && !campaign.metaCampaignId.startsWith('mock_')) {
    try {
      const ins = await (await fetch(
        `${META}/${campaign.metaCampaignId}/insights` +
        `?fields=spend,impressions,clicks,actions,cost_per_action_type` +
        `&date_preset=maximum&access_token=${token}`
      )).json();

      if (ins.error) {
        out.attributedByMeta = { error: ins.error.message };
      } else {
        const row = (ins.data ?? [])[0];
        const actions: { action_type: string; value: string }[] = row?.actions ?? [];
        const conversionKey = `offsite_conversion.custom.${(out.customConversion as any)?.id ?? ''}`;
        const attributed = actions.find((a) => a.action_type === conversionKey);
        out.attributedByMeta = {
          spend: row?.spend ?? '0',
          impressions: row?.impressions ?? '0',
          linkClicks: row?.clicks ?? '0',
          spotifyClickConversions: attributed ? Number(attributed.value) : 0,
          // Everything Meta did attribute — useful when the custom conversion is
          // zero but other action types show the funnel is otherwise working.
          allActions: actions.map((a) => `${a.action_type}=${a.value}`),
          note:
            'spotifyClickConversions is what Ads Manager would show in the "Promohit Spotify Click" ' +
            'column. If it is 0 while allActions shows landing_page_view/link_click, Meta is seeing ' +
            'the traffic but not crediting our conversion event.',
        };
      }
    } catch (e) {
      out.attributedByMeta = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ?compare=1 — dump every custom conversion and campaign on the ad account
  // with the config that governs attribution, so a WORKING campaign can be
  // diffed against a broken one. Far more reliable than reasoning about which
  // Meta setting might matter.
  if (req.nextUrl.searchParams.get('compare') === '1') {
    try {
      const ccs = await (await fetch(
        `${META}/act_${adAccountId}/customconversions` +
        `?fields=id,name,custom_event_type,rule,last_fired_time,is_archived,event_source_id` +
        `&limit=50&access_token=${token}`
      )).json();

      const camps = await (await fetch(
        `${META}/act_${adAccountId}/campaigns` +
        `?fields=id,name,objective,status,effective_status` +
        `&limit=25&access_token=${token}`
      )).json();

      // For each campaign: how it optimises, and what Meta actually attributed.
      const detail = await Promise.all(
        ((camps.data ?? []) as any[]).slice(0, 12).map(async (c) => {
          const [sets, ins] = await Promise.all([
            fetch(`${META}/${c.id}/adsets?fields=name,optimization_goal,promoted_object,status&limit=10&access_token=${token}`).then((r) => r.json()).catch(() => null),
            fetch(`${META}/${c.id}/insights?fields=spend,actions&date_preset=maximum&access_token=${token}`).then((r) => r.json()).catch(() => null),
          ]);
          const actions: any[] = ins?.data?.[0]?.actions ?? [];
          return {
            name: c.name,
            objective: c.objective,
            status: c.effective_status ?? c.status,
            spend: ins?.data?.[0]?.spend ?? '0',
            adSets: (sets?.data ?? []).map((s: any) => ({
              optimizationGoal: s.optimization_goal,
              promotedObject: s.promoted_object ?? null,
            })),
            // Only the conversion-ish actions — the rest is engagement noise.
            conversionActions: actions
              .filter((a) => /offsite_conversion|purchase|lead|complete_registration/i.test(a.action_type))
              .map((a) => `${a.action_type}=${a.value}`),
          };
        }),
      );

      out.compare = {
        customConversions: ((ccs.data ?? []) as any[]).map((c) => ({
          id: c.id,
          name: c.name,
          customEventType: c.custom_event_type,
          eventSourceId: c.event_source_id ?? null,
          archived: c.is_archived ?? false,
          lastFired: ago(c.last_fired_time),
          rule: typeof c.rule === 'string' ? c.rule : JSON.stringify(c.rule),
        })),
        campaigns: detail,
        note:
          'Find the campaign with a non-empty conversionActions — that one attributes. Then diff its ' +
          'objective / optimizationGoal / promotedObject, and its custom conversion customEventType + ' +
          'rule, against the one that does not.',
      };
    } catch (e) {
      out.compare = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ?test=1 — send a real Conversions API event and return Meta's verbatim
  // reply. This is the decisive check on the SERVER-side path: the custom
  // conversion can fire purely from the browser pixel, so "it fired" doesn't
  // prove our CAPI calls are being accepted. Look for events_received: 1 and an
  // empty messages array; anything else is why attribution is missing.
  if (req.nextUrl.searchParams.get('test') === '1') {
    try {
      const testEvent = {
        data: [
          {
            event_name: SPOTIFY_CLICK_EVENT,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_source_url: `${process.env.NEXTAUTH_URL}/go/${campaign.id}`,
            event_id: `debug-${Date.now()}`,
            user_data: {
              client_ip_address: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || '1.1.1.1',
              client_user_agent: req.headers.get('user-agent') ?? 'promohit-debug',
              // A synthetic ad click id, so this mirrors a real attributed event.
              fbc: `fb.1.${Date.now()}.debug_fbclid_test`,
            },
          },
        ],
      };
      const capiRes = await fetch(`${META}/${pixelId}/events?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testEvent),
      });
      out.capiTest = {
        httpStatus: capiRes.status,
        response: await capiRes.json().catch(() => null),
        sentEventName: SPOTIFY_CLICK_EVENT,
        sentSourceUrl: `${process.env.NEXTAUTH_URL}/go/${campaign.id}`,
        note:
          'events_received: 1 with no messages means our server-side path works and the ' +
          'problem is attribution/reporting. An error here is the actual bug.',
      };
    } catch (e) {
      out.capiTest = { exception: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json(out);
}
