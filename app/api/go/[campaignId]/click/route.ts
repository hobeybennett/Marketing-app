import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SPOTIFY_CLICK_EVENT } from '@/lib/meta-campaign';

export const dynamic = 'force-dynamic';

const META = 'https://graph.facebook.com/v22.0';

// Send the Spotify-click conversion to Meta server-side (Conversions API). The
// client pixel often can't fire before the browser navigates to Spotify —
// especially in Instagram's in-app browser — so the reliable path is server-side.
// Matches the "Promohit Spotify Click" custom conversion (event + /go/ URL).
async function sendCapiConversion(req: NextRequest, campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { user: { select: { metaConnection: { select: { pixelId: true, accessToken: true } } } } },
  });
  const pixelId = campaign?.user?.metaConnection?.pixelId;
  const token = campaign?.user?.metaConnection?.accessToken;
  if (!pixelId || !token) return;

  const ua = req.headers.get('user-agent') ?? '';
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const fbp = req.cookies.get('_fbp')?.value;
  const fbc = req.cookies.get('_fbc')?.value;
  const eventId = req.nextUrl.searchParams.get('event_id') || undefined; // dedupes vs the client pixel
  const sourceUrl = req.headers.get('referer') || `${process.env.NEXTAUTH_URL}/go/${campaignId}`;

  const body = {
    data: [
      {
        event_name: SPOTIFY_CLICK_EVENT,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: sourceUrl,
        ...(eventId ? { event_id: eventId } : {}),
        user_data: {
          ...(ip ? { client_ip_address: ip } : {}),
          client_user_agent: ua,
          ...(fbp ? { fbp } : {}),
          ...(fbc ? { fbc } : {}),
        },
      },
    ],
  };

  const res = await fetch(`${META}/${pixelId}/events?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn('[capi] conversion send failed:', await res.text().catch(() => ''));
  }
}

// Crawlers, link-preview scrapers, and generic bots would otherwise inflate
// smart-link reach counts (page_view records) with non-human traffic.
const BOT_UA = /bot|crawler|spider|crawling|facebookexternalhit|facebot|slurp|bingpreview|whatsapp|telegrambot|discordbot|embedly|quora link preview|redditbot|applebot|petalbot|semrush|ahrefs|mj12bot|dotbot|headlesschrome|python-requests|axios|curl|wget|node-fetch|go-http-client/i;

function isBot(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? '';
  return ua === '' || BOT_UA.test(ua);
}

async function recordClick(req: NextRequest, campaignId: string): Promise<string> {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform') ?? 'unknown';
  // Don't record bot/crawler traffic — keeps campaign reach/click counts human.
  if (isBot(req)) return platform;
  try {
    await prisma.smartLinkClick.create({
      data: {
        campaignId,
        platform,
        utmSource: searchParams.get('utm_source') ?? null,
        utmMedium: searchParams.get('utm_medium') ?? null,
        utmCampaign: searchParams.get('utm_campaign') ?? null,
        utmContent: searchParams.get('utm_content') ?? null,
        referrer: req.headers.get('referer') ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    });
  } catch {
    // Non-fatal — tracking is best-effort.
    console.error('[smart-link] Failed to record click');
  }

  // Fire the server-side conversion for real Spotify clicks (not page views).
  if (platform === 'spotify' || platform === 'spotify_playlist') {
    await sendCapiConversion(req, campaignId).catch(() => {
      console.error('[capi] conversion send threw');
    });
  }
  return platform;
}

// navigator.sendBeacon sends a POST — this handles beacon-recorded clicks
// (e.g. the Spotify button), which record without redirecting.
export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  await recordClick(req, params.campaignId);
  return NextResponse.json({ recorded: true });
}

export async function GET(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const platform = await recordClick(req, params.campaignId);
  const recordOnly = req.nextUrl.searchParams.get('record_only') === '1';

  // Page views and beacon-style GETs just record, no redirect.
  if (recordOnly || platform === 'page_view') {
    return NextResponse.json({ recorded: true });
  }

  // Determine redirect URL for direct link navigations.
  let redirectUrl = '/';
  if (platform === 'spotify') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.campaignId },
      select: { spotifyUrl: true },
    });
    redirectUrl = campaign?.spotifyUrl ?? 'https://open.spotify.com';
  } else if (platform === 'spotify_playlist') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.campaignId },
      select: { spotifyPlaylistUrl: true },
    });
    redirectUrl = campaign?.spotifyPlaylistUrl ?? 'https://open.spotify.com';
  } else if (platform === 'apple_music') {
    redirectUrl = 'https://music.apple.com';
  } else if (platform === 'youtube_music') {
    redirectUrl = 'https://music.youtube.com';
  }

  return NextResponse.redirect(redirectUrl, 302);
}
