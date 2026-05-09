import { NextRequest, NextResponse } from 'next/server';

function extractTrackId(url: string): string | null {
  const match = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

async function getSpotifyToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error('Failed to get Spotify token');
  const data = await res.json();
  return data.access_token;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const trackId = extractTrackId(url);
  if (!trackId) return NextResponse.json({ error: 'Invalid Spotify track URL' }, { status: 400 });

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Spotify credentials not configured' }, { status: 500 });
  }

  const token = await getSpotifyToken();

  const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!trackRes.ok) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

  const track = await trackRes.json();

  const artistName = track.artists.map((a: { name: string }) => a.name).join(', ');
  const songTitle = track.name;
  const coverArtUrl = track.album.images[0]?.url ?? null;

  return NextResponse.json({ artistName, songTitle, coverArtUrl });
}
