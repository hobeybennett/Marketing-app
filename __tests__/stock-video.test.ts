import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildStockQuery, findStockVideos, pickVibes, VIBES } from '../lib/stock-video';

describe('pickVibes', () => {
  it('returns the requested number of distinct vibes', () => {
    const picked = pickVibes({ genre: 'edm', mood: null }, 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((v) => v.name)).size).toBe(10);
  });

  it('leads with vibes matching the genre', () => {
    expect(pickVibes({ genre: 'metal', mood: null }, 1)[0].name).toBe('smoke-embers');
    expect(pickVibes({ genre: 'folk', mood: null }, 1)[0].name).toBe('golden-hour');
  });

  it('leads with vibes matching the mood over the genre', () => {
    expect(pickVibes({ genre: 'rock', mood: 'sad' }, 1)[0].name).toBe('rain-window');
  });

  it('is deterministic for the same input', () => {
    const a = pickVibes({ genre: 'pop', mood: 'chill' }, 5).map((v) => v.name);
    const b = pickVibes({ genre: 'pop', mood: 'chill' }, 5).map((v) => v.name);
    expect(a).toEqual(b);
  });

  it('still returns vibes when nothing matches, and never more than the library', () => {
    expect(pickVibes({ genre: 'zzz', mood: null }, 5)).toHaveLength(5);
    expect(pickVibes({ genre: null, mood: null }, 99)).toHaveLength(VIBES.length);
    expect(pickVibes({ genre: null, mood: null }, 0)).toHaveLength(1);
  });
});

describe('buildStockQuery', () => {
  it('prefers mood over genre', () => {
    expect(buildStockQuery({ genre: 'rock', mood: 'dreamy' })).toContain('dreamy');
  });

  it('falls back to genre when mood is unknown', () => {
    expect(buildStockQuery({ genre: 'edm', mood: null })).toContain('neon');
  });

  it('matches genre substrings (e.g. "hip hop" → hip)', () => {
    expect(buildStockQuery({ genre: 'Hip Hop', mood: null })).toContain('city night');
  });

  it('returns a generic atmospheric query when nothing is known', () => {
    expect(buildStockQuery({ genre: null, mood: null })).toBe('abstract atmospheric light motion');
  });

  it('never returns an empty query', () => {
    for (const g of [null, '', 'something-unmapped']) {
      expect(buildStockQuery({ genre: g, mood: null }).length).toBeGreaterThan(0);
    }
  });
});

describe('findStockVideos', () => {
  const originalKey = process.env.PEXELS_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('no-ops without an API key (never calls the network)', async () => {
    delete process.env.PEXELS_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await findStockVideos('anything')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns [] rather than throwing when the API errors', async () => {
    process.env.PEXELS_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);
    expect(await findStockVideos('anything')).toEqual([]);
  });

  it('picks HD files and caps results at the requested count', async () => {
    process.env.PEXELS_API_KEY = 'test-key';
    const video = (id: number) => ({
      id,
      width: 1080,
      height: 1920,
      video_files: [
        { link: `https://cdn/${id}-sd.mp4`, width: 360, height: 640, quality: 'sd' },
        { link: `https://cdn/${id}-hd.mp4`, width: 1080, height: 1920, quality: 'hd' },
      ],
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ videos: [video(1), video(2), video(3)] }),
    } as Response);

    const links = await findStockVideos('neon', 2);
    expect(links).toEqual(['https://cdn/1-hd.mp4', 'https://cdn/2-hd.mp4']);
  });
});
