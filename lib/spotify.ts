// Shared Spotify Web API helpers. Lives in lib/ (not an app/api route) so the
// BullMQ worker can import them too — workers can't import from Next route files.

// Handles all Spotify link shapes: open.spotify.com/track/<id>, locale-prefixed
// open.spotify.com/intl-pt/track/<id>, trailing ?si=… query params, and the
// spotify:track:<id> URI form.
export function extractTrackId(url: string): string | null {
  const match = url.match(/track[/:]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function extractPlaylistId(url: string): string | null {
  const match = url.match(/playlist[/:]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export async function getSpotifyToken(): Promise<string> {
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

// Current Spotify popularity (0-100) behind a Spotify URL, or null if it can't be
// resolved. Prefers the track's own popularity, but Spotify now strips that field
// from track responses for some app/token types — so it falls back to the primary
// artist's popularity (a coarser but reliable momentum signal). Best-effort:
// never throws, so a snapshot job or the worker loop can't be broken by it.
export async function fetchTrackPopularity(spotifyUrl: string): Promise<number | null> {
  const trackId = extractTrackId(spotifyUrl);
  if (!trackId) return null;
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return null;
  try {
    const token = await getSpotifyToken();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    let artistId: string | null = null;

    for (const url of [
      `https://api.spotify.com/v1/tracks/${trackId}`,
      `https://api.spotify.com/v1/tracks/${trackId}?market=US`,
    ]) {
      const res = await fetch(url, auth);
      if (!res.ok) continue;
      const track = await res.json();
      if (typeof track?.popularity === 'number') return track.popularity;
      if (!artistId && track?.artists?.[0]?.id) artistId = track.artists[0].id;
    }

    if (artistId) {
      const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, auth);
      if (res.ok) {
        const artist = await res.json();
        if (typeof artist?.popularity === 'number') return artist.popularity;
      }
    }
    return null;
  } catch {
    return null;
  }
}
