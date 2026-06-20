import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function extractTrackId(url: string): string | null {
  const match = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractPlaylistId(url: string): string | null {
  const match = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

async function getSpotifyToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error('Failed to get Spotify token');
  return (await res.json()).access_token;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const trackId = extractTrackId(url);
  const playlistId = extractPlaylistId(url);

  if (!trackId && !playlistId) {
    return NextResponse.json({ error: 'Invalid Spotify track or playlist URL' }, { status: 400 });
  }

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Spotify credentials not configured' }, { status: 500 });
  }

  const token = await getSpotifyToken();

  if (trackId) {
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!trackRes.ok) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    const track = await trackRes.json();

    let genres: string[] = [];
    const artistId = track.artists[0]?.id;
    if (artistId) {
      const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (artistRes.ok) {
        const artist = await artistRes.json();
        genres = artist.genres ?? [];
      }
    }

    return NextResponse.json({
      artistName: track.artists.map((a: { name: string }) => a.name).join(', '),
      songTitle: track.name,
      coverArtUrl: track.album.images[0]?.url ?? null,
      type: 'track',
      genres,
    });
  } else {
    const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!playlistRes.ok) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    const playlist = await playlistRes.json();
    return NextResponse.json({
      artistName: playlist.owner?.display_name ?? 'Playlist',
      songTitle: playlist.name,
      coverArtUrl: playlist.images?.[0]?.url ?? null,
      type: 'playlist',
    });
  }
}
