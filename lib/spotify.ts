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

// Current Spotify popularity (0-100) for the track behind a Spotify URL, or null
// if it can't be resolved. Best-effort — never throws, so a snapshot job or the
// worker loop can't be broken by a transient Spotify hiccup.
export async function fetchTrackPopularity(spotifyUrl: string): Promise<number | null> {
  const trackId = extractTrackId(spotifyUrl);
  if (!trackId) return null;
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return null;
  try {
    const token = await getSpotifyToken();
    const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const track = await res.json();
    return typeof track.popularity === 'number' ? track.popularity : null;
  } catch {
    return null;
  }
}
