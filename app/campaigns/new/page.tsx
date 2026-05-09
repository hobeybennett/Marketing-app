'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

type SpotifyData = {
  artistName: string;
  songTitle: string;
  coverArtUrl: string | null;
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
    if (!spotify) {
      setError('Look up a Spotify track first');
      return;
    }
    setLoading(true);
    setError('');

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('artistName', artistName);
    formData.set('songTitle', songTitle);
    if (spotify.coverArtUrl) formData.set('coverArtUrl', spotify.coverArtUrl);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        body: formData,
      });
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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">New Campaign</h1>

      {/* Step 1: Spotify lookup */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-1">Step 1 — Paste your Spotify link</h2>
        <p className="text-sm text-gray-400 mb-4">We'll pull the track info and cover art automatically.</p>

        <div className="flex gap-2">
          <input
            type="url"
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
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
                unoptimized
              />
            )}
            <div>
              <p className="font-semibold text-sm">{spotify.songTitle}</p>
              <p className="text-gray-400 text-sm">{spotify.artistName}</p>
              <p className="text-green-400 text-xs mt-1">✓ Track found</p>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: rest of form */}
      {spotify && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold">Step 2 — Confirm details</h2>

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Genre</label>
                <select
                  name="genre"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                >
                  <option value="">Select genre</option>
                  <option value="pop">Pop</option>
                  <option value="hip-hop">Hip-Hop</option>
                  <option value="r&b">R&B</option>
                  <option value="rock">Rock</option>
                  <option value="electronic">Electronic</option>
                  <option value="country">Country</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Mood</label>
                <select
                  name="mood"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
                >
                  <option value="">Select mood</option>
                  <option value="energetic">Energetic</option>
                  <option value="chill">Chill</option>
                  <option value="emotional">Emotional</option>
                  <option value="hype">Hype</option>
                  <option value="romantic">Romantic</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Audio File (MP3 or WAV) *
              </label>
              <p className="text-xs text-gray-500 mb-2">Upload your full track — Spotify previews are too short for ads.</p>
              <input
                name="audio"
                type="file"
                accept="audio/*"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
              />
            </div>

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
