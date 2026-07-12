import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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
