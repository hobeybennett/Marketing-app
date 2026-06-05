import { notFound } from 'next/navigation';
import Image from 'next/image';
import { prisma } from '@/lib/prisma';
import { SmartLinkClickRecorder } from './SmartLinkClickRecorder';

interface Props {
  params: { campaignId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export const dynamic = 'force-dynamic';

export default async function SmartLinkPage({ params, searchParams }: Props) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: {
      id: true,
      artistName: true,
      songTitle: true,
      coverArtUrl: true,
      spotifyUrl: true,
    },
  });

  if (!campaign) notFound();

  const utmSource = String(searchParams.utm_source ?? '');
  const utmMedium = String(searchParams.utm_medium ?? '');
  const utmCampaign = String(searchParams.utm_campaign ?? '');
  const utmContent = String(searchParams.utm_content ?? '');

  const coverSrc = campaign.coverArtUrl?.startsWith('http')
    ? campaign.coverArtUrl
    : `/api/covers/${campaign.id}`;

  const buildClickUrl = (platform: string) => {
    const params = new URLSearchParams({
      platform,
      ...(utmSource && { utm_source: utmSource }),
      ...(utmMedium && { utm_medium: utmMedium }),
      ...(utmCampaign && { utm_campaign: utmCampaign }),
      ...(utmContent && { utm_content: utmContent }),
    });
    return `/api/go/${campaign.id}/click?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
      <SmartLinkClickRecorder
        campaignId={campaign.id}
        utmSource={utmSource}
        utmMedium={utmMedium}
        utmCampaign={utmCampaign}
        utmContent={utmContent}
      />

      {/* Blurred cover art background */}
      <div className="absolute inset-0 pointer-events-none">
        <img
          src={coverSrc}
          alt=""
          className="w-full h-full object-cover opacity-20 blur-2xl scale-110"
        />
        <div className="absolute inset-0 bg-gray-950/70" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Cover art */}
        <div className="aspect-square w-full mb-6 rounded-2xl overflow-hidden bg-gray-900 relative shadow-2xl shadow-black/60"
             style={{ boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}>
          <Image
            src={coverSrc}
            alt={`${campaign.songTitle} cover art`}
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        {/* Track info */}
        <h1 className="font-display text-2xl font-700 text-center mb-1">{campaign.songTitle}</h1>
        <p className="text-gray-400 text-center mb-8 text-sm tracking-wide uppercase">{campaign.artistName}</p>

        {/* Streaming buttons */}
        <div className="space-y-3">
          {campaign.spotifyUrl && (
            <a
              href={buildClickUrl('spotify')}
              className="flex items-center justify-center gap-3 w-full bg-[#1db954] hover:bg-[#1ed760] text-black font-semibold py-4 px-6 rounded-xl transition"
            >
              <SpotifyIcon />
              Listen on Spotify
            </a>
          )}

          <a
            href={buildClickUrl('apple_music')}
            className="flex items-center justify-center gap-3 w-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 backdrop-blur text-white font-semibold py-4 px-6 rounded-xl transition"
          >
            <AppleMusicIcon />
            Apple Music
          </a>

          <a
            href={buildClickUrl('youtube_music')}
            className="flex items-center justify-center gap-3 w-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 backdrop-blur text-white font-semibold py-4 px-6 rounded-xl transition"
          >
            <YouTubeMusicIcon />
            YouTube Music
          </a>
        </div>

        <p className="text-center text-xs text-gray-600 mt-8 tracking-widest uppercase">Powered by Hitback</p>
      </div>
    </div>
  );
}

function SpotifyIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function AppleMusicIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208A7.57 7.57 0 00.09 5.08c-.008.42-.012.84-.012 1.26v11.32c0 .42.004.84.012 1.26.028.87.148 1.73.473 2.52.622 1.5 1.86 2.38 3.34 2.74.87.22 1.76.26 2.65.27.38.01.76.01 1.14.01h11.22c.38 0 .76 0 1.14-.01.89-.01 1.78-.05 2.65-.27 1.48-.36 2.72-1.24 3.34-2.74.32-.79.44-1.65.47-2.52.01-.42.01-.84.01-1.26V6.34c0-.072-.002-.143-.006-.216zm-11.96 14.25c-3.59 0-6.5-2.91-6.5-6.5s2.91-6.5 6.5-6.5 6.5 2.91 6.5 6.5-2.91 6.5-6.5 6.5zm6.78-11.68a1.52 1.52 0 110-3.04 1.52 1.52 0 010 3.04zM12.034 7.5a6.374 6.374 0 100 12.748 6.374 6.374 0 000-12.748zm2.89 9.64l-2.89-1.67-2.89 1.67.76-3.27-2.5-2.17 3.3-.28 1.33-3.1 1.33 3.1 3.3.28-2.5 2.17.76 3.27z" />
    </svg>
  );
}

function YouTubeMusicIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z" />
    </svg>
  );
}
