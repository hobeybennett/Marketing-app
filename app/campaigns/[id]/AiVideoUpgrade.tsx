'use client';
import { useState, useEffect } from 'react';

type Props = {
  campaignId: string;
  status?: string | null;         // NONE | PAID | GENERATING | READY | SELECTED | FAILED
  options?: string[] | null;      // generated clip URLs
  choiceUrl?: string | null;
  isOwner?: boolean;
};

export default function AiVideoUpgrade({ campaignId, status, options, isOwner }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = status ?? 'NONE';

  // While generating, refresh so the options appear when ready.
  useEffect(() => {
    if (s === 'PAID' || s === 'GENERATING') {
      const t = setInterval(() => window.location.reload(), 15000);
      return () => clearInterval(t);
    }
  }, [s]);

  async function buy() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ai-video/checkout`, { method: 'POST' });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else setError(json.error || 'Could not start checkout');
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  async function testGenerate() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ai-video/test-generate`, { method: 'POST' });
      if (res.ok) window.location.reload();
      else setError((await res.json().catch(() => ({})))?.error || 'Could not start test generation');
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  return (
    <div className="bg-gradient-to-br from-violet-900/30 to-blue-900/20 border border-violet-800/40 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-700 text-base">✨ AI Video</h2>
        <span className="text-xs bg-violet-900/50 text-violet-200 border border-violet-700/50 px-2 py-0.5 rounded-full">
          Premium
        </span>
      </div>

      {(s === 'NONE' || s === 'FAILED') && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            Turn your ads into a <strong className="text-gray-200">cinematic AI lyric video</strong> — a
            dynamic AI-generated background with your <strong className="text-gray-200">lyrics popping up in time
            with the music</strong>, instead of the static template.
          </p>
          {s === 'FAILED' && <p className="text-xs text-amber-400 mb-3">Last attempt failed — you can try again.</p>}
          <button
            onClick={buy}
            disabled={busy}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50"
          >
            {busy ? 'Starting checkout…' : 'Upgrade to AI video — $1.99'}
          </button>
        </>
      )}

      {(s === 'PAID' || s === 'GENERATING') && (
        <div className="text-sm text-gray-300 py-2">
          <p className="font-medium">Creating your AI lyric video…</p>
          <p className="text-xs text-gray-500 mt-1">Transcribing lyrics + generating the AI background (~1–2 min). This page refreshes automatically.</p>
        </div>
      )}

      {(s === 'APPLIED' || s === 'READY' || s === 'SELECTED') && options && options.length > 0 && (
        <>
          <p className="text-sm text-green-300 font-medium mb-1">✓ AI lyric video applied</p>
          <p className="text-xs text-gray-400 mb-3">
            Your ads now use a cinematic AI background with your lyrics popping up in time with the music.
          </p>
          <div className="flex justify-center">
            <div className="w-1/2 rounded-lg overflow-hidden border border-gray-700 bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={options[0]} className="w-full aspect-[9/16] object-cover" autoPlay muted loop playsInline />
            </div>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {isOwner && (
        <button
          onClick={testGenerate}
          disabled={busy}
          className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 transition disabled:opacity-50"
        >
          {busy ? '…' : '🛠 Owner: test-generate AI lyric video (free)'}
        </button>
      )}
    </div>
  );
}
