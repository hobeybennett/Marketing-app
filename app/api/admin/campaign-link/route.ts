import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Owner-only: repoint a campaign's smart link at a different Spotify destination.
//
// Live ads link to /go/{campaignId} (the smart link), and that page reads the
// destination from the DB — so this takes effect on running ads instantly, with
// no Meta edit and no new ad review.
//
//   GET /api/admin/campaign-link              → list campaigns + current links
//   GET /api/admin/campaign-link?q=rather     → filter by song/artist name
//   GET /api/admin/campaign-link?id=<id>&playlist=<idOrUrl>&go=1
//     &mode=playlist   (default) playlist is the only button
//     &mode=both                 track button first, playlist second
//     &track=<idOrUrl>           set/replace the track link instead
//
// Accepts a bare Spotify ID or a full URL. Bare IDs are recommended on mobile:
// a pasted share URL carries ?si=…&utm_source=… which would break query parsing.
const SPOTIFY_ID = /^[A-Za-z0-9]{16,}$/;

function toSpotifyUrl(input: string, kind: 'playlist' | 'track'): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (SPOTIFY_ID.test(raw)) return `https://open.spotify.com/${kind}/${raw}`;
  // Full URL (possibly locale-prefixed, possibly with share/tracking params) —
  // keep only the canonical /{kind}/{id} form.
  const m = raw.match(/open\.spotify\.com\/(?:[a-z-]+\/)?(playlist|track)\/([A-Za-z0-9]+)/);
  if (m) return `https://open.spotify.com/${m[1]}/${m[2]}`;
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const id = sp.get('id');
  const playlistIn = sp.get('playlist');
  const trackIn = sp.get('track');

  if (!id || sp.get('go') !== '1') {
    const q = sp.get('q')?.trim();
    const campaigns = await prisma.campaign.findMany({
      where: q
        ? {
            OR: [
              { songTitle: { contains: q, mode: 'insensitive' } },
              { artistName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        songTitle: true,
        artistName: true,
        status: true,
        promoteType: true,
        spotifyUrl: true,
        spotifyPlaylistUrl: true,
      },
    });
    return NextResponse.json({
      dryRun: true,
      campaigns,
      howTo:
        '?id=<campaignId>&playlist=<spotifyIdOrUrl>&go=1  ' +
        '(add &mode=both to keep the track button too; &track=<idOrUrl> to set the track link)',
    });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, songTitle: true, spotifyUrl: true, spotifyPlaylistUrl: true, promoteType: true },
  });
  if (!campaign) return NextResponse.json({ error: 'campaign not found' }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (playlistIn) {
    const url = toSpotifyUrl(playlistIn, 'playlist');
    if (!url) {
      return NextResponse.json({ error: `Could not parse a Spotify playlist from "${playlistIn}"` }, { status: 400 });
    }
    data.spotifyPlaylistUrl = url;
    // 'playlist' shows only the playlist button; 'both' keeps the track button first.
    data.promoteType = sp.get('mode') === 'both' ? 'track' : 'playlist';
  }

  if (trackIn) {
    const url = toSpotifyUrl(trackIn, 'track');
    if (!url) {
      return NextResponse.json({ error: `Could not parse a Spotify track from "${trackIn}"` }, { status: 400 });
    }
    data.spotifyUrl = url;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change — pass &playlist=… and/or &track=…' }, { status: 400 });
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data,
    select: {
      id: true,
      songTitle: true,
      promoteType: true,
      spotifyUrl: true,
      spotifyPlaylistUrl: true,
    },
  });

  return NextResponse.json({
    ok: true,
    before: campaign,
    after: updated,
    note: 'Live ads point at the smart link, so this is already in effect — no Meta change, no new ad review.',
    smartLink: `${process.env.NEXTAUTH_URL ?? 'https://promohit.marketing'}/go/${updated.id}`,
  });
}
