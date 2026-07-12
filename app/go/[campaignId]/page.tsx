import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { SmartLinkClickRecorder } from './SmartLinkClickRecorder';
import { MetaPixelScript } from './MetaPixelScript';
import { SpotifyButton, SpotifyPlaylistButton } from './StreamingButtons';

interface Props {
  params: { campaignId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export const dynamic = 'force-dynamic';

// Link preview (Facebook/Instagram/iMessage) should show the song, not Promohit's
// own marketing. This overrides the root layout's default OG tags for /go pages.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { artistName: true, songTitle: true, coverArtUrl: true },
  });
  if (!campaign) return { title: 'Listen' };

  const base = process.env.NEXTAUTH_URL ?? '';
  const image = campaign.coverArtUrl?.startsWith('http')
    ? campaign.coverArtUrl
    : `${base}/api/covers/${params.campaignId}`;
  const title = `${campaign.songTitle} — ${campaign.artistName}`;
  const description = `Listen to ${campaign.songTitle} by ${campaign.artistName} on Spotify.`;

  return {
    title,
    description,
    alternates: { canonical: `/go/${params.campaignId}` },
    openGraph: {
      title,
      description,
      type: 'music.song',
      url: `/go/${params.campaignId}`,
      images: [{ url: image, width: 640, height: 640, alt: `${campaign.songTitle} cover art` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function SmartLinkPage({ params, searchParams }: Props) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: {
      id: true,
      artistName: true,
      songTitle: true,
      coverArtUrl: true,
      spotifyUrl: true,
      spotifyPlaylistUrl: true,
      promoteType: true,
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

  const isPlaylist = campaign.promoteType === 'playlist';

  const coverSrc = campaign.coverArtUrl?.startsWith('http')
    ? campaign.coverArtUrl
    : `/api/covers/${campaign.id}`;

  const pixelId = campaign.user?.metaConnection?.pixelId ?? null;

  // MusicRecording structured data so search engines understand the song + artist
  // (and can show rich results). Mirrors the Linkfire/SmartURL pattern.
  const base = process.env.NEXTAUTH_URL ?? '';
  const absoluteCover = campaign.coverArtUrl?.startsWith('http')
    ? campaign.coverArtUrl
    : `${base}/api/covers/${campaign.id}`;
  const streamingUrl = campaign.spotifyUrl ?? campaign.spotifyPlaylistUrl ?? undefined;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: campaign.songTitle,
    byArtist: { '@type': 'MusicGroup', name: campaign.artistName },
    image: absoluteCover,
    url: `${base}/go/${campaign.id}`,
    ...(streamingUrl ? { sameAs: streamingUrl } : {}),
  };

  const buildClickUrl = (platform: string, recordOnly = false) => {
    const p = new URLSearchParams({
      platform,
      ...(recordOnly ? { record_only: '1' } : {}),
      ...(utmSource && { utm_source: utmSource }),
      ...(utmMedium && { utm_medium: utmMedium }),
      ...(utmCampaign && { utm_campaign: utmCampaign }),
      ...(utmContent && { utm_content: utmContent }),
    });
    return `/api/go/${campaign.id}/click?${p.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 relative overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
          {isPlaylist ? (
            campaign.spotifyPlaylistUrl && (
              <SpotifyPlaylistButton
                href={buildClickUrl('spotify_playlist')}
                destination={campaign.spotifyPlaylistUrl}
                songTitle={campaign.songTitle}
                artistName={campaign.artistName}
                primary
              />
            )
          ) : (
            <>
              {campaign.spotifyUrl && (
                <SpotifyButton
                  recordUrl={buildClickUrl('spotify', true)}
                  destination={campaign.spotifyUrl}
                  songTitle={campaign.songTitle}
                  artistName={campaign.artistName}
                />
              )}

              {campaign.spotifyPlaylistUrl && (
                <SpotifyPlaylistButton
                  href={buildClickUrl('spotify_playlist')}
                  destination={campaign.spotifyPlaylistUrl}
                  songTitle={campaign.songTitle}
                  artistName={campaign.artistName}
                />
              )}
            </>
          )}
        </div>

        {/* Crawlable descriptive copy + internal link — turns the smart-link into
            a real SEO asset instead of a bare button page. */}
        <p className="text-center text-xs text-gray-500 mt-8 leading-relaxed">
          Stream {campaign.songTitle} by {campaign.artistName} on Spotify — the
          latest release from {campaign.artistName}, promoted with Promohit.
        </p>
        <p className="text-center text-xs mt-4">
          <Link href="/discover" className="text-gray-500 hover:text-gray-300 underline underline-offset-2 transition">
            Discover more new music →
          </Link>
        </p>

        <p className="text-center text-xs text-gray-600 mt-6 tracking-widest uppercase">
          <Link href="/" className="hover:text-gray-400 transition">Powered by Promohit</Link>
        </p>
      </div>
    </div>
  );
}
