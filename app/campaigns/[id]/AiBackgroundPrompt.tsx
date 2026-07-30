'use client';
import { useState } from 'react';

// Shown after purchasing the AI video: the artist optionally describes the vibe of
// the cinematic AI background they want, then generates. Empty is fine — we build a
// prompt from the track's genre/mood.
const IDEAS = [
  'Neon city at night, rain, cinematic',
  'Dreamy pastel clouds, soft light',
  'Dark moody smoke and embers',
  'Retro 80s sunset, palm trees',
  'Abstract liquid ink, vibrant colour',
];

export default function AiBackgroundPrompt({
  campaignId,
  onStarted,
}: {
  campaignId: string;
  // Tells the parent to refetch — the card flips to GENERATING in place.
  onStarted?: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ai-video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.ok) {
        onStarted?.();
        return; // stay "Starting…" until the parent's refetch swaps this view out
      }
      setError((await res.json().catch(() => ({})))?.error || 'Could not start generation.');
    } catch {
      setError('Network error.');
    }
    setGenerating(false);
  }

  return (
    <div>
      <p className="text-sm text-gray-300 font-medium mb-1">Describe your background</p>
      <p className="text-xs text-gray-400 mb-3">
        Tell us the vibe and we&apos;ll generate a cinematic AI background for your ad. Keep it to a
        scene or mood — <strong className="text-gray-200">no text or logos</strong>. Leave it blank and
        we&apos;ll match your track&apos;s genre automatically.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder={'e.g. Neon city at night, rain on glass, slow cinematic drift'}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 mb-2"
      />

      <div className="flex flex-wrap gap-1.5 mb-3">
        {IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => setPrompt(idea)}
            className="text-[11px] px-2 py-1 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 transition"
          >
            {idea}
          </button>
        ))}
      </div>

      <button
        onClick={generate}
        disabled={generating}
        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition disabled:opacity-50"
      >
        {generating ? 'Starting…' : 'Generate AI video →'}
      </button>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
