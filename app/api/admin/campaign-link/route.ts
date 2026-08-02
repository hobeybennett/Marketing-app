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
//     &track=<idOrUrl>           set/replace the track link
//     &highlight=0               don't highlight the campaign track in the playlist
//     &style=highlight (default) /playlist/{id}?highlight=spotify:track:{trackId}
//                                — opens the playlist scrolled to the track
//     &style=context             /track/{trackId}?context=spotify:playlist/{id}
//                                — opens the track itself with the playlist as its
//                                  playback queue, so it plays and then rolls on
//
// Either way the point is to avoid a bare /track/ link, which falls into
// algorithmic radio when the song ends instead of continuing through the playlist.
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

  // Track first — a track set in this same request can seed the playlist highlight.
  if (trackIn) {
    const url = toSpotifyUrl(trackIn, 'track');
    if (!url) {
      return NextResponse.json({ error: `Could not parse a Spotify track from "${trackIn}"` }, { status: 400 });
    }
    data.spotifyUrl = url;
  }

  let highlightedTrack: string | null = null;
  if (playlistIn) {
    const base = toSpotifyUrl(playlistIn, 'playlist');
    if (!base) {
      return NextResponse.json({ error: `Could not parse a Spotify playlist from "${playlistIn}"` }, { status: 400 });
    }
    // Open the playlist with THIS campaign's track highlighted, so listeners play
    // it in playlist context and Spotify rolls on into the surrounding tracks.
    // (A bare /track/ link sends them to algorithmic radio afterwards instead.)
    // Disable with &highlight=0.
    const trackUrl = (data.spotifyUrl as string | undefined) ?? campaign.spotifyUrl;
    const trackId = trackUrl?.match(/\/track\/([A-Za-z0-9]+)/)?.[1] ?? null;
    const playlistId = base.match(/\/playlist\/([A-Za-z0-9]+)/)?.[1] ?? null;
    const style = sp.get('style') ?? 'highlight';

    if (style === 'context' && trackId && playlistId) {
      // Open the TRACK itself with the playlist loaded as its playback queue, so
      // it plays immediately and then continues into the surrounding tracks.
      // One button, and clicks still record as platform 'spotify'.
      data.spotifyUrl = `https://open.spotify.com/track/${trackId}?context=spotify:playlist:${playlistId}`;
      data.spotifyPlaylistUrl = null;
      data.promoteType = 'track';
      highlightedTrack = trackId;
    } else {
      // Open the playlist scrolled to / highlighting this track.
      if (sp.get('highlight') !== '0' && trackId) {
        highlightedTrack = trackId;
        data.spotifyPlaylistUrl = `${base}?highlight=spotify:track:${trackId}`;
      } else {
        data.spotifyPlaylistUrl = base;
      }
      // 'playlist' shows only the playlist button; 'both' keeps the track button first.
      data.promoteType = sp.get('mode') === 'both' ? 'track' : 'playlist';
    }
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
    highlightedTrack: highlightedTrack
      ? `Playlist opens with track ${highlightedTrack} highlighted — plays in playlist context.`
      : 'No track highlight applied.',
    note: 'Live ads point at the smart link, so this is already in effect — no Meta change, no new ad review.',
    smartLink: `${process.env.NEXTAUTH_URL ?? 'https://promohit.marketing'}/go/${updated.id}`,
  });
}
