// fal.ai video generation — used for the paid "AI video" upsell. Generates short
// abstract background clips (Kling) that the pipeline loops behind the cover-art
// card. Uses fal's queue API (submit → poll → fetch result) via plain fetch, so
// there's no SDK dependency. Requires FAL_KEY.

const FAL_QUEUE = 'https://queue.fal.run';
// Text-to-video: genre/mood-driven abstract motion for the background. Kling v3
// "standard" — higher quality than v1.6 at ~the same ~$0.03/s. Override with
// FAL_VIDEO_MODEL (e.g. a pro/master tier) without a deploy.
const KLING_TEXT_TO_VIDEO = process.env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v3/standard/text-to-video';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build a background-video prompt from what we know about the track. No text/faces
// so it composites cleanly behind our card + drawtext overlays.
export function buildVideoPrompt(opts: {
  genre?: string | null;
  mood?: string | null;
  soundsLike?: string[];
}): string {
  const descriptors: string[] = [];
  if (opts.mood) descriptors.push(opts.mood);
  if (opts.genre) descriptors.push(`${opts.genre}`);
  const vibe = descriptors.length ? descriptors.join(', ') : 'moody, atmospheric';
  return (
    `Cinematic abstract background visuals for a ${vibe} music ad. ` +
    `Dynamic flowing motion, rich vibrant lighting and colour, film grain, ` +
    `shallow depth of field. No text, no logos, no faces. Seamless, high quality.`
  );
}

async function generateOne(key: string, prompt: string, durationSec: number): Promise<string | null> {
  try {
    const submitRes = await fetch(`${FAL_QUEUE}/${KLING_TEXT_TO_VIDEO}`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        duration: String(durationSec),
        aspect_ratio: '1:1',
      }),
    });
    const submit = await submitRes.json();
    const statusUrl: string | undefined = submit.status_url;
    const responseUrl: string | undefined = submit.response_url;
    if (!statusUrl || !responseUrl) {
      console.warn('[fal] submit returned no status/response url:', JSON.stringify(submit).slice(0, 300));
      return null;
    }

    // Poll up to ~5 minutes.
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const st = await (await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } })).json();
      if (st.status === 'COMPLETED') break;
      if (st.status === 'FAILED' || st.status === 'ERROR') {
        console.warn('[fal] generation failed:', JSON.stringify(st).slice(0, 300));
        return null;
      }
    }

    const result = await (await fetch(responseUrl, { headers: { Authorization: `Key ${key}` } })).json();
    const url = result?.video?.url ?? result?.videos?.[0]?.url ?? null;
    return typeof url === 'string' ? url : null;
  } catch (err) {
    console.warn('[fal] generateOne exception:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Generate `count` background clips in parallel. Returns the URLs that succeeded
// (best-effort — a partial set is still usable as options).
export async function generateAiVideoClips(opts: {
  prompt: string;
  count?: number;
  durationSec?: number;
}): Promise<string[]> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY not set');
  const count = opts.count ?? 3;
  const durationSec = opts.durationSec ?? 5;
  const results = await Promise.all(
    Array.from({ length: count }, () => generateOne(key, opts.prompt, durationSec)),
  );
  return results.filter((u): u is string => !!u);
}
