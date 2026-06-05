import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const PLATFORM_URLS: Record<string, string | null> = {
  spotify: null,           // resolved from campaign.spotifyUrl
  apple_music: 'https://music.apple.com',
  youtube_music: 'https://music.youtube.com',
  page_view: null,        // no redirect for page views
};

export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform') ?? 'unknown';
  const utmSource = searchParams.get('utm_source') ?? null;
  const utmMedium = searchParams.get('utm_medium') ?? null;
  const utmCampaign = searchParams.get('utm_campaign') ?? null;
  const utmContent = searchParams.get('utm_content') ?? null;
  const recordOnly = searchParams.get('record_only') === '1';

  // Record the click
  try {
    await prisma.smartLinkClick.create({
      data: {
        campaignId: params.campaignId,
        platform,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        referrer: req.headers.get('referer') ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    });
  } catch {
    // Non-fatal — log but continue to redirect
    console.error('[smart-link] Failed to record click');
  }

  // If record_only (page view), return 200 OK without redirecting
  if (recordOnly || platform === 'page_view') {
    return NextResponse.json({ recorded: true });
  }

  // Determine redirect URL
  let redirectUrl: string | null = null;

  if (platform === 'spotify') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.campaignId },
      select: { spotifyUrl: true },
    });
    redirectUrl = campaign?.spotifyUrl ?? 'https://open.spotify.com';
  } else if (platform === 'apple_music') {
    redirectUrl = 'https://music.apple.com';
  } else if (platform === 'youtube_music') {
    redirectUrl = 'https://music.youtube.com';
  } else {
    redirectUrl = '/';
  }

  // Pass through UTM params to destination if it's a hypewave URL
  return NextResponse.redirect(redirectUrl, 302);
}
