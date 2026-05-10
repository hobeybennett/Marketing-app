'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

type SpotifyData = {
  artistName: string;
  songTitle: string;
  coverArtUrl: string | null;
  previewUrl: string | null;
};

export default function NewCampaignPage() {
  const router = useRouter();
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotify, setSpotify] = useState<SpotifyData | null>(null);

  const [artistName, setArtistName] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function lookupSpotify() {
    if (!spotifyUrl.trim()) return;
    setSpotifyLoading(true);
    setSpotifyError('');
    setSpotify(null);

    try {
      const res = await fetch('/api/spotify/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: spotifyUrl }),
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spotify) return;

    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    formData.set('artistName', artistName);
    formData.set('songTitle', songTitle);
    if (spotify.coverArtUrl) formData.set('coverArtUrl', spotify.coverArtUrl);
    if (spotify.previewUrl) formData.set('previewUrl', spotify.previewUrl);

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
      <h1 className="text-3xl font-bold mb-8">New Campaign</h1>

      {/* Spotify lookup */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-1">Paste your Spotify link</h2>
        <p className="text-sm text-gray-400 mb-4">We'll pull the track info, cover art, and audio automatically.</p>

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
            onClick={lookupSpotify}
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
              <Image
                src={spotify.coverArtUrl}
                alt="Cover art"
                width={56}
                height={56}
                className="rounded"
              />
            )}
            <div>
              <p className="font-semibold text-sm">{spotify.songTitle}</p>
              <p className="text-gray-400 text-sm">{spotify.artistName}</p>
              {spotify.previewUrl
                ? <p className="text-green-400 text-xs mt-1">✓ Audio preview found</p>
                : <p className="text-yellow-400 text-xs mt-1">⚠ No preview — upload your MP3 below</p>
              }
            </div>
          </div>
        )}
      </div>

      {/* Rest of form — only shown after lookup */}
      {spotify && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
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

            {/* Only show audio upload if no preview available */}
            {!spotify.previewUrl && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Audio File (MP3 or WAV) *
                </label>
                <input
                  name="audio"
                  type="file"
                  accept="audio/*"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                name="autoLaunch"
                id="autoLaunch"
                value="true"
                className="w-4 h-4 accent-blue-600"
              />
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
