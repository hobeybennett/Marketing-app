'use client';
import { useState } from 'react';
import AiBackgroundPrompt from './AiBackgroundPrompt';

type Props = {
  campaignId: string;
  status?: string | null;         // NONE | PROMPT | GENERATING | APPLIED | FAILED
  options?: string[] | null;      // generated clip URLs
  choiceUrl?: string | null;
  isOwner?: boolean;
  // Parent refetches campaign data; the card updates in place from new props
  // (the page polls while aiVideoStatus is GENERATING — no reloads needed).
  onRefresh?: () => void;
};

export default function AiVideoUpgrade({ campaignId, status, options, isOwner, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = status ?? 'NONE';

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
      if (res.ok) onRefresh?.();
      else setError((await res.json().catch(() => ({})))?.error || 'Could not start test generation');
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  const isOffer = s === 'NONE' || s === 'FAILED';

  return (
    <div
      className={`rounded-xl p-5 mb-4 ${
        isOffer
          ? 'bg-gradient-to-br from-violet-600/25 to-blue-600/15 border border-violet-500/50 ring-1 ring-violet-500/25 shadow-lg shadow-violet-950/40'
          : 'bg-gray-900 border border-gray-800'
      }`}
    >
      {isOffer ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✨</span>
            <h2 className="font-display font-700 text-lg leading-tight">Add an AI Video Background</h2>
            <span className="ml-auto text-[10px] font-semibold bg-violet-500/30 text-violet-100 border border-violet-400/40 px-2 py-0.5 rounded-full uppercase tracking-wide">
              Popular
            </span>
          </div>
          <p className="text-sm text-violet-100/80 mb-4">
            Swap the static template for a <strong className="text-white">cinematic AI background you describe</strong> —
            a scroll-stopping visual that makes your ad look premium.
          </p>
          {s === 'FAILED' && <p className="text-xs text-amber-300 mb-3">Last attempt failed — you can try again.</p>}
          <button
            onClick={buy}
            disabled={busy}
            className="w-full py-3 rounded-lg text-sm font-bold bg-white text-violet-700 hover:bg-violet-50 transition disabled:opacity-50 shadow"
          >
            {busy ? 'Starting checkout…' : 'Upgrade — $1.99'}
          </button>
        </>
      ) : (
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-700 text-base">✨ AI Video Background</h2>
          <span className="text-xs bg-violet-900/50 text-violet-200 border border-violet-700/50 px-2 py-0.5 rounded-full">
            Premium
          </span>
        </div>
      )}

      {s === 'PROMPT' && <AiBackgroundPrompt campaignId={campaignId} onStarted={onRefresh} />}

      {s === 'GENERATING' && (
        <div className="text-sm text-gray-300 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
            <p className="font-medium">Creating your AI video…</p>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">Generating the AI background, then re-rendering your ads with it (~2–5 min). It&apos;ll appear here when ready.</p>
        </div>
      )}

      {(s === 'APPLIED' || s === 'READY' || s === 'SELECTED') && options && options.length > 0 && (
        <>
          <p className="text-sm text-green-300 font-medium mb-1">✓ AI background applied</p>
          <p className="text-xs text-gray-400 mb-3">
            Here&apos;s your AI background — your ads below re-render with it over the next few minutes.
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
          {busy ? '…' : '🛠 Owner: test-generate AI video (free)'}
        </button>
      )}
    </div>
  );
}
