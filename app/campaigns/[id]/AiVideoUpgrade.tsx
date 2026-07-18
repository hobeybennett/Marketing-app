'use client';
import { useState, useEffect } from 'react';

type Props = {
  campaignId: string;
  status?: string | null;         // NONE | PAID | GENERATING | READY | SELECTED | FAILED
  options?: string[] | null;      // generated clip URLs
  choiceUrl?: string | null;
};

export default function AiVideoUpgrade({ campaignId, status, options, choiceUrl }: Props) {
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

  async function choose(url: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ai-video/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choiceUrl: url }),
      });
      if (res.ok) window.location.reload();
      else setError((await res.json().catch(() => ({})))?.error || 'Could not apply choice');
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
            Upgrade your creatives with an <strong className="text-gray-200">AI-generated video background</strong> —
            dynamic, cinematic motion instead of the static template. You&apos;ll get{' '}
            <strong className="text-gray-200">3 options to choose from</strong>.
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
          <p className="font-medium">Generating your AI videos…</p>
          <p className="text-xs text-gray-500 mt-1">This takes ~1–2 minutes. This page refreshes automatically.</p>
        </div>
      )}

      {s === 'READY' && options && options.length > 0 && (
        <>
          <p className="text-sm text-gray-300 mb-3">Pick your favourite — we&apos;ll rebuild your 5 ads with it:</p>
          <div className="grid grid-cols-3 gap-2">
            {options.map((url, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-gray-700 bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={url} className="w-full aspect-square object-cover" autoPlay muted loop playsInline />
                <button
                  onClick={() => choose(url)}
                  disabled={busy}
                  className="w-full py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50"
                >
                  Use this
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {s === 'SELECTED' && (
        <p className="text-sm text-green-300 py-2">
          ✓ AI video applied — your creatives are being rebuilt with it.
          {choiceUrl && <span className="block text-xs text-gray-500 mt-1">You can review the new videos shortly.</span>}
        </p>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
