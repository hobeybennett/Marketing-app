import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { SPOTIFY_CLICK_CONVERSION_NAME } from '@/lib/meta-campaign';
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

  const out: Record<string, unknown> = {
    campaign: campaign.songTitle,
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
      const r = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.json().catch(() => null);
      probe.trackFetchStatus = r.status;
      probe.spotifyApiError = body?.error?.message ?? null;
      const popularity = typeof body?.popularity === 'number' ? body.popularity : null;
      probe.liveScore = popularity;
      if (popularity != null) {
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        await prisma.popularitySnapshot.upsert({
          where: { campaignId_date: { campaignId: campaign.id, date: day } },
          create: { campaignId: campaign.id, date: day, popularity },
          update: { popularity },
        });
        probe.seededToday = true;
        probe.note = 'Seeded — reload the campaign Insights page to see the Popularity chart.';
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

  return NextResponse.json(out);
}
