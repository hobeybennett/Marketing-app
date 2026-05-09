'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        body: new FormData(e.currentTarget),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Artist Name *</label>
            <input
              name="artistName"
              required
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Song Title *</label>
            <input
              name="songTitle"
              required
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Genre</label>
            <select
              name="genre"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
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
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none"
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
            Audio File (MP3, WAV) *
          </label>
          <input
            name="audio"
            type="file"
            accept="audio/*"
            required
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Cover Art (JPG, PNG) *
          </label>
          <input
            name="coverArt"
            type="file"
            accept="image/*"
            required
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
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

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium text-lg transition"
        >
          {loading ? 'Uploading…' : 'Create Campaign'}
        </button>
      </form>
    </div>
  );
}
