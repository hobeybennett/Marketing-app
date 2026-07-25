'use client';
import { useState } from 'react';

type Line = { text: string; start: number; end: number };

// Shown after purchasing the AI video: the artist gets their lyrics right (scan +
// fix, or paste their own), then generates the video.
export default function LyricsEditor({ campaignId }: { campaignId: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState('');

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  async function scan() {
    setScanning(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/lyrics/scan`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && Array.isArray(json.lines)) setLines(json.lines);
      else setError(json.error || 'Scan failed — try again or paste your lyrics.');
    } catch {
      setError('Network error while scanning.');
    }
    setScanning(false);
  }

  // Overlay pasted text onto the scanned line timings (extrapolating ~3s/line
  // beyond what was scanned). Scanning first gives the best timing.
  function applyPaste() {
    const pasted = pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    let lastEnd = 0;
    const next: Line[] = pasted.map((text, i) => {
      if (lines[i]) {
        lastEnd = lines[i].end;
        return { text, start: lines[i].start, end: lines[i].end };
      }
      const start = lastEnd;
      lastEnd = start + 3;
      return { text, start, end: lastEnd };
    });
    setLines(next);
    setPasteOpen(false);
  }

  function editLine(i: number, text: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, text } : l)));
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function generate(withLyrics: boolean) {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/lyrics/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: withLyrics ? lines.filter((l) => l.text.trim()) : [] }),
      });
      if (res.ok) window.location.reload();
      else setError((await res.json().catch(() => ({})))?.error || 'Could not start generation.');
    } catch {
      setError('Network error.');
    }
    setGenerating(false);
  }

  return (
    <div>
      <p className="text-sm text-gray-300 font-medium mb-1">Add your lyrics</p>
      <p className="text-xs text-gray-400 mb-3">
        We&apos;ll show them popping up in time with the music. Scan your track to auto-detect them,
        then fix any wrong words — or paste your own.
      </p>

      <div className="flex gap-2 mb-3">
        <button
          onClick={scan}
          disabled={scanning || generating}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50"
        >
          {scanning ? 'Scanning…' : lines.length ? 'Re-scan audio' : '🎙 Scan my audio'}
        </button>
        <button
          onClick={() => setPasteOpen((v) => !v)}
          disabled={generating}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition disabled:opacity-50"
        >
          Paste lyrics
        </button>
      </div>

      {pasteOpen && (
        <div className="mb-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'One line per row…\nScan first for accurate timing.'}
            rows={5}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={applyPaste}
            disabled={!pasteText.trim()}
            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50"
          >
            Use these lyrics
          </button>
        </div>
      )}

      {lines.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-1.5 mb-3 pr-1">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-600 tabular-nums w-8 shrink-0">{fmt(l.start)}</span>
              <input
                value={l.text}
                onChange={(e) => editLine(i, e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
              />
              <button onClick={() => removeLine(i)} className="text-gray-600 hover:text-red-400 text-xs shrink-0" title="Remove line">✕</button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => generate(lines.length > 0)}
        disabled={generating || scanning}
        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition disabled:opacity-50"
      >
        {generating ? 'Starting…' : lines.length ? 'Generate video with these lyrics →' : 'Generate video (no lyrics) →'}
      </button>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
