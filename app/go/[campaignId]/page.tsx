import { notFound } from 'next/navigation';
import Image from 'next/image';
import { prisma } from '@/lib/prisma';
import { SmartLinkClickRecorder } from './SmartLinkClickRecorder';
import { MetaPixelScript } from './MetaPixelScript';
import { SpotifyButton, AppleMusicButton, YouTubeMusicButton } from './StreamingButtons';

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
      user: {
        select: {
          metaConnection: { select: { pixelId: true } }
        }
      },
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

  const pixelId = campaign.user?.metaConnection?.pixelId ?? null;

  const buildClickUrl = (platform: string) => {
    const p = new URLSearchParams({
      platform,
      ...(utmSource && { utm_source: utmSource }),
      ...(utmMedium && { utm_medium: utmMedium }),
      ...(utmCampaign && { utm_campaign: utmCampaign }),
      ...(utmContent && { utm_content: utmContent }),
    });
    return `/api/go/${campaign.id}/click?${p.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
      {pixelId && (
        <MetaPixelScript
          pixelId={pixelId}
          campaignId={campaign.id}
          songTitle={campaign.songTitle}
          artistName={campaign.artistName}
        />
      )}

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
            <SpotifyButton
              href={buildClickUrl('spotify')}
              songTitle={campaign.songTitle}
              artistName={campaign.artistName}
            />
          )}

          <AppleMusicButton
            href={buildClickUrl('apple_music')}
            songTitle={campaign.songTitle}
            artistName={campaign.artistName}
          />

          <YouTubeMusicButton
            href={buildClickUrl('youtube_music')}
            songTitle={campaign.songTitle}
            artistName={campaign.artistName}
          />
        </div>

        <p className="text-center text-xs text-gray-600 mt-8 tracking-widest uppercase">Powered by Promohit</p>
      </div>
    </div>
  );
}
