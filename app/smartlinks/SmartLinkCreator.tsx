'use client';
import { useState } from 'react';

type Lookup = {
  artistName: string;
  songTitle: string;
  coverArtUrl: string | null;
  type: 'track' | 'playlist';
};

export default function SmartLinkCreator({ onCreated }: { onCreated?: () => void }) {
  const [url, setUrl] = useState('');
  const [meta, setMeta] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [apple, setApple] = useState('');
  const [youtube, setYoutube] = useState('');
  const [soundcloud, setSoundcloud] = useState('');

  async function lookup() {
    setBusy(true);
    setError('');
    setCreated(null);
    try {
      const res = await fetch(`/api/spotify/lookup?url=${encodeURIComponent(url.trim())}`);
      const json = await res.json();
      if (!res.ok || !json.coverArtUrl) {
        setError(json.error || 'Could not read that Spotify link.');
      } else {
        setMeta(json);
      }
    } catch {
      setError('Network error.');
    }
    setBusy(false);
  }

  async function create() {
    if (!meta) return;
    setBusy(true);
    setError('');
    const isPlaylist = meta.type === 'playlist';
    try {
      const res = await fetch('/api/smartlinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName: meta.artistName,
          songTitle: meta.songTitle,
          coverArtUrl: meta.coverArtUrl,
          promoteType: isPlaylist ? 'playlist' : 'track',
          spotifyUrl: isPlaylist ? '' : url.trim(),
          spotifyPlaylistUrl: isPlaylist ? url.trim() : '',
          appleMusicUrl: apple.trim(),
          youtubeUrl: youtube.trim(),
          soundcloudUrl: soundcloud.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setCreated(json.url);
        setMeta(null);
        setUrl('');
        setApple('');
        setYoutube('');
        setSoundcloud('');
        onCreated?.();
      } else {
        setError(json.error || 'Could not create the link.');
      }
    } catch {
      setError('Network error.');
    }
    setBusy(false);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="font-semibold mb-1">New smart link</h2>
      <p className="text-xs text-gray-500 mb-4">
        Paste a Spotify track or playlist link — we&apos;ll pull the artwork and details automatically.
      </p>

      <div className="flex gap-2 mb-3">
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setMeta(null); }}
          placeholder="https://open.spotify.com/track/…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={lookup}
          disabled={busy || !url.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition disabled:opacity-50 whitespace-nowrap"
        >
          {busy && !meta ? '…' : 'Look up'}
        </button>
      </div>

      {meta && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-3">
            {meta.coverArtUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={meta.coverArtUrl} alt="" className="w-14 h-14 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{meta.songTitle}</p>
              <p className="text-xs text-gray-400 truncate">{meta.artistName}</p>
            </div>
            <button
              onClick={create}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? 'Creating…' : 'Create link'}
            </button>
          </div>

          {/* Optional extra platforms — each one that's filled in becomes a button. */}
          <p className="text-xs text-gray-500 mt-4 mb-2">
            Add other platforms <span className="text-gray-600">(optional — leave blank to hide)</span>
          </p>
          <div className="space-y-2">
            {([
              ['Apple Music', apple, setApple, 'https://music.apple.com/…'],
              ['YouTube', youtube, setYoutube, 'https://youtube.com/watch?v=…'],
              ['SoundCloud', soundcloud, setSoundcloud, 'https://soundcloud.com/…'],
            ] as const).map(([label, value, setter, placeholder]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-24 shrink-0">{label}</span>
                <input
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {created && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-3">
          <p className="text-xs text-green-300 font-medium mb-2">✓ Your smart link is live</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={created}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200"
            />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(created);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition whitespace-nowrap"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
