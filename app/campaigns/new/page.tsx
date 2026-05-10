'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const TEST_SPOTIFY_URL = 'https://open.spotify.com/track/6Jv7kjGkhY2fT4yuBF3aTz';

type SpotifyData = {
  artistName: string;
  songTitle: string;
  coverArtUrl: string | null;
};

function generateTestWav(durationSecs = 30): Blob {
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSecs;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  write(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.3;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export default function NewCampaignPage() {
  const router = useRouter();
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotify, setSpotify] = useState<SpotifyData | null>(null);
  const [artistName, setArtistName] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [audioFileName, setAudioFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function lookupSpotify(url = spotifyUrl) {
    if (!url.trim()) return;
    setSpotifyLoading(true);
    setSpotifyError('');
    setSpotify(null);

    try {
      const res = await fetch('/api/spotify/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setSpotify(data);
      setArtistName(data.artistName);
      setSongTitle(data.songTitle);
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSpotifyLoading(false);
    }
  }

  async function useTestData() {
    setSpotifyUrl(TEST_SPOTIFY_URL);
    await lookupSpotify(TEST_SPOTIFY_URL);

    const wav = generateTestWav(30);
    const file = new File([wav], 'test-audio.wav', { type: 'audio/wav' });
    const dt = new DataTransfer();
    dt.items.add(file);
    if (audioInputRef.current) {
      audioInputRef.current.files = dt.files;
      setAudioFileName('test-audio.wav');
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spotify) return;
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    formData.set('artistName', artistName);
    formData.set('songTitle', songTitle);
    if (spotify.coverArtUrl) formData.set('coverArtUrl', spotify.coverArtUrl);

    try {
      const res = await fetch('/api/campaigns', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create campaign');
      }
      const campaign = await res.json();
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">New Campaign</h1>
        <button
          type="button"
          onClick={useTestData}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-600 px-3 py-1.5 rounded-lg text-gray-300 transition"
        >
          Use test data
        </button>
      </div>

      {/* Step 1: Spotify lookup */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-1">Step 1 — Paste your Spotify link</h2>
        <p className="text-sm text-gray-400 mb-4">We'll pull your track info and cover art automatically.</p>

        <div className="flex gap-2">
          <input
            type="url"
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), lookupSpotify())}
            placeholder="https://open.spotify.com/track/..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-green-500 outline-none text-sm"
          />
          <button
            type="button"
            onClick={() => lookupSpotify()}
            disabled={spotifyLoading || !spotifyUrl.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap"
          >
            {spotifyLoading ? 'Looking up…' : 'Look up'}
          </button>
        </div>

        {spotifyError && <p className="text-red-400 text-sm mt-2">{spotifyError}</p>}

        {spotify && (
          <div className="flex items-center gap-4 mt-4 bg-gray-800 rounded-lg p-3">
            {spotify.coverArtUrl && (
              <Image src={spotify.coverArtUrl} alt="Cover art" width={56} height={56} className="rounded" />
            )}
            <div>
              <p className="font-semibold text-sm">{spotify.songTitle}</p>
              <p className="text-gray-400 text-sm">{spotify.artistName}</p>
              <p className="text-green-400 text-xs mt-1">✓ Track found</p>
            </div>
          </div>
        )}
      </div>

      {/* Step 2 */}
      {spotify && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold">Step 2 — Upload your track</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Artist Name</label>
                <input
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Song Title</label>
                <input
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Audio File *</label>
              <input
                ref={audioInputRef}
                name="audio"
                type="file"
                accept=".mp3,.wav,.aiff,.m4a,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/aiff,audio/flac"
                required
                onChange={(e) => setAudioFileName(e.target.files?.[0]?.name || '')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
              />
              {audioFileName && (
                <p className="text-xs text-gray-400 mt-1">Selected: {audioFileName}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" name="autoLaunch" id="autoLaunch" value="true" className="w-4 h-4 accent-blue-600" />
              <label htmlFor="autoLaunch" className="text-sm text-gray-300">
                Auto-launch to Meta (skip approval step)
              </label>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium text-lg transition"
          >
            {loading ? 'Creating campaign…' : 'Create Campaign'}
          </button>
        </form>
      )}
    </div>
  );
}
