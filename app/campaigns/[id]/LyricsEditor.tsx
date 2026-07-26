'use client';
import { useState } from 'react';

// Shown after purchasing the AI video: the artist types/pastes the lyric lines to
// show on the ad (their hook/chorus), then generates. Auto-scan is offered as a
// rough fallback but typing is the primary path (music transcription is unreliable).
export default function LyricsEditor({ campaignId }: { campaignId: string }) {
  const [text, setText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  async function scan() {
    setScanning(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/lyrics/scan`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && Array.isArray(json.lines) && json.lines.length) {
        setText(json.lines.map((l: { text: string }) => l.text).filter(Boolean).join('\n'));
      } else {
        setError('Auto-detect came back empty — just type your lyrics below.');
      }
    } catch {
      setError('Network error while scanning.');
    }
    setScanning(false);
  }

  async function generate() {
    setGenerating(true);
    setError('');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/lyrics/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      if (res.ok) window.location.reload();
      else setError((await res.json().catch(() => ({})))?.error || 'Could not start generation.');
    } catch {
      setError('Network error.');
    }
    setGenerating(false);
  }

  const lineCount = text.split('\n').map((l) => l.trim()).filter(Boolean).length;

  return (
    <div>
      <p className="text-sm text-gray-300 font-medium mb-1">Add your lyrics</p>
      <p className="text-xs text-gray-400 mb-3">
        Type or paste the lines to show on your ad — <strong className="text-gray-200">your hook or chorus works
        best</strong> (a few punchy lines beat the whole song). They&apos;ll appear over the AI background, one at a
        time.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"I'd rather die\nthan let you go\n…"}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 mb-2"
      />

      <button
        onClick={generate}
        disabled={generating || scanning}
        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition disabled:opacity-50"
      >
        {generating
          ? 'Starting…'
          : lineCount > 0
          ? `Generate video with ${lineCount} line${lineCount === 1 ? '' : 's'} →`
          : 'Generate video (no lyrics) →'}
      </button>

      <button
        onClick={scan}
        disabled={scanning || generating}
        className="w-full mt-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 transition disabled:opacity-50"
      >
        {scanning ? 'Auto-detecting… (can take a minute)' : 'Or try auto-detecting from the audio (rough)'}
      </button>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
