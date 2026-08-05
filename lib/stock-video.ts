// Free stock video backgrounds (Pexels). Used to give the FREE video template a
// cinematic moving background instead of the blurred cover art — no AI cost.
//
// Licence: Pexels content is free for commercial use including ads, with no
// attribution required. Clips may not be redistributed unaltered — we composite
// them with the artist's audio and text overlays, which is the intended use.
//
// Requires PEXELS_API_KEY (free key from pexels.com/api). Without one, every
// function here no-ops and the renderer falls back to the existing template.

const PEXELS_API = 'https://api.pexels.com/videos/search';

// Map what we know about the track to stock-footage search terms. Deliberately
// abstract/atmospheric — anything with people or a strong subject fights the
// text overlay and dates badly.
export function buildStockQuery(opts: { genre?: string | null; mood?: string | null }): string {
  const mood = opts.mood?.trim().toLowerCase();
  const genre = opts.genre?.trim().toLowerCase();

  const byMood: Record<string, string> = {
    dark: 'dark moody smoke abstract',
    sad: 'rain window melancholy slow',
    melancholy: 'rain window melancholy slow',
    chill: 'soft gradient clouds calm',
    dreamy: 'dreamy clouds pastel light leaks',
    happy: 'sunlight warm bokeh colourful',
    energetic: 'neon lights motion city night',
    aggressive: 'dark smoke fire embers',
    romantic: 'soft focus warm light petals',
  };
  const byGenre: Record<string, string> = {
    edm: 'neon lights motion abstract',
    electronic: 'neon lights motion abstract',
    house: 'neon city night lights',
    techno: 'dark strobe abstract motion',
    hip: 'city night street lights',
    rap: 'city night street lights',
    rock: 'dark grunge texture motion',
    metal: 'dark smoke fire abstract',
    indie: 'film grain sunset nostalgic',
    folk: 'nature forest golden hour',
    country: 'open road golden hour landscape',
    pop: 'colourful bokeh lights motion',
    jazz: 'moody bar lights bokeh',
    classical: 'elegant slow abstract light',
    ambient: 'slow clouds abstract calm',
  };

  if (mood && byMood[mood]) return byMood[mood];
  if (genre) {
    const key = Object.keys(byGenre).find((k) => genre.includes(k));
    if (key) return byGenre[key];
  }
  return 'abstract atmospheric light motion';
}

type PexelsVideoFile = { link: string; width: number | null; height: number | null; quality: string };
type PexelsVideo = { id: number; width: number; height: number; video_files: PexelsVideoFile[] };

// Pick the best file for a 1080x1920 canvas: prefer HD, and the smallest file
// that still covers the canvas so downloads stay quick on a small worker.
function bestFile(video: PexelsVideo): string | null {
  const usable = video.video_files
    .filter((f) => f.link && (f.height ?? 0) >= 720)
    .sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  return usable[0]?.link ?? video.video_files[0]?.link ?? null;
}

// Search for portrait clips matching the track. Returns up to `count` distinct
// video URLs — the renderer gives each creative a different one so the five ads
// aren't identical. Returns [] on any failure; callers fall back silently.
export async function findStockVideos(query: string, count = 5): Promise<string[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];

  try {
    const url = `${PEXELS_API}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${Math.min(
      count * 3,
      30,
    )}`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) {
      console.warn(`[stock-video] search failed: ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { videos?: PexelsVideo[] };
    const videos = json.videos ?? [];
    const links = videos.map(bestFile).filter((l): l is string => !!l);
    return links.slice(0, count);
  } catch (err) {
    console.warn('[stock-video] search error:', err instanceof Error ? err.message : err);
    return [];
  }
}
