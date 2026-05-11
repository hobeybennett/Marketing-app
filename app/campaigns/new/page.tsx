'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const TEST_SPOTIFY_URL = 'https://open.spotify.com/track/6Jv7kjGkhY2fT4yuBF3aTz';

type SpotifyData = { artistName: string; songTitle: string; coverArtUrl: string | null };
type Clip = { name: string; startSec: number };

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateTestWav(durationSecs = 180): Blob {
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSecs;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  write(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true);
  write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); write(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.3 * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function initClips(duration: number): Clip[] {
  const step = Math.max(30, Math.floor((duration / 5) / 30) * 30);
  return Array.from({ length: 5 }, (_, i) => ({
    name: `Section ${i + 1}`,
    startSec: Math.min(i * step, Math.max(0, duration - 30 - (4 - i) * 30)),
  }));
}

export default function NewCampaignPage() {
  const router = useRouter();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Step 1 — Spotify
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotify, setSpotify] = useState<SpotifyData | null>(null);

  // Step 2 — Audio
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(180);

  // Background
  const [bgMode, setBgMode] = useState<'spotify' | 'upload'>('spotify');
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);

  // Clips
  const [clips, setClips] = useState<Clip[]>(initClips(180));
  const [editingName, setEditingName] = useState<number | null>(null);

  // Submit
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showEditor = !!spotify && !!audioFile;

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
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSpotifyLoading(false);
    }
  }

  function handleAudioChange(file: File | null) {
    if (!file) return;
    setAudioFile(file);
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      const dur = Math.floor(audio.duration);
      setAudioDuration(dur);
      setClips(initClips(dur));
    };
  }

  function handleBgChange(file: File | null) {
    if (!file) return;
    setBgFile(file);
    setBgPreview(URL.createObjectURL(file));
    setBgMode('upload');
  }

  function updateClip(index: number, patch: Partial<Clip>) {
    setClips((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  }

  async function useTestData() {
    setSpotifyUrl(TEST_SPOTIFY_URL);
    await lookupSpotify(TEST_SPOTIFY_URL);
    const wav = generateTestWav(180);
    const file = new File([wav], 'test-audio.wav', { type: 'audio/wav' });
    const dt = new DataTransfer();
    dt.items.add(file);
    if (audioInputRef.current) audioInputRef.current.files = dt.files;
    setAudioFile(file);
    setAudioDuration(180);
    setClips(initClips(180));
  }

  async function handleSubmit() {
    if (!spotify || !audioFile) return;
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.set('artistName', spotify.artistName);
    formData.set('songTitle', spotify.songTitle);
    if (spotify.coverArtUrl) formData.set('coverArtUrl', spotify.coverArtUrl);
    formData.set('audio', audioFile);
    formData.set('clips', JSON.stringify(clips));
    if (bgMode === 'upload' && bgFile) formData.set('background', bgFile);

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

  const backgroundSrc = bgMode === 'upload' && bgPreview
    ? bgPreview
    : spotify?.coverArtUrl ?? null;

  const isVideo = bgMode === 'upload' && bgFile?.type.startsWith('video/');
  const maxStart = Math.max(0, audioDuration - 30);

  return (
    <div className="max-w-xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-2">
        <h1 className="text-2xl font-bold">New Campaign</h1>
        <button
          type="button"
          onClick={useTestData}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg text-gray-400 transition"
        >
          Use test data
        </button>
      </div>

      {/* Step 1: Spotify */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <p className="text-sm font-medium text-gray-300 mb-3">Paste your Spotify link</p>
        <div className="flex gap-2">
          <input
            type="url"
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), lookupSpotify())}
            placeholder="https://open.spotify.com/track/..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none text-sm"
          />
          <button
            type="button"
            onClick={() => lookupSpotify()}
            disabled={spotifyLoading || !spotifyUrl.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 px-4 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap"
          >
            {spotifyLoading ? '…' : 'Look up'}
          </button>
        </div>
        {spotifyError && <p className="text-red-400 text-xs mt-2">{spotifyError}</p>}
        {spotify && (
          <div className="flex items-center gap-3 mt-3 bg-gray-800 rounded-lg p-2.5">
            {spotify.coverArtUrl && (
              <Image src={spotify.coverArtUrl} alt="" width={40} height={40} className="rounded" />
            )}
            <div>
              <p className="text-sm font-medium">{spotify.songTitle}</p>
              <p className="text-xs text-gray-400">{spotify.artistName}</p>
            </div>
            <span className="ml-auto text-green-400 text-xs">✓</span>
          </div>
        )}
      </div>

      {/* Step 2: Audio upload */}
      {spotify && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <p className="text-sm font-medium text-gray-300 mb-3">Upload your track</p>
          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,.wav,.aiff,.m4a,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/aiff,audio/flac"
            onChange={(e) => handleAudioChange(e.target.files?.[0] ?? null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-sm file:cursor-pointer"
          />
          {audioFile && (
            <p className="text-xs text-gray-400 mt-1.5">
              {audioFile.name} · {formatTime(audioDuration)}
            </p>
          )}
        </div>
      )}

      {/* Clip editor */}
      {showEditor && (
        <>
          {/* Background */}
          <div className="mb-4">
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-gray-800">
              {backgroundSrc && !isVideo && (
                <Image src={backgroundSrc} alt="Background" fill className="object-cover" unoptimized />
              )}
              {isVideo && bgPreview && (
                <video src={bgPreview} className="w-full h-full object-cover" autoPlay muted loop playsInline />
              )}
              {!backgroundSrc && (
                <div className="flex items-center justify-center h-full text-gray-600 text-sm">No background</div>
              )}

              {/* Change background overlay */}
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur transition"
              >
                Change background
              </button>
            </div>

            <input
              ref={bgInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => handleBgChange(e.target.files?.[0] ?? null)}
              className="hidden"
            />

            {bgMode === 'spotify' && (
              <p className="text-xs text-gray-500 mt-1.5 text-center">Using Spotify cover art · tap to change</p>
            )}
          </div>

          {/* Clips */}
          <div className="space-y-3 mb-6">
            {clips.map((clip, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                {/* Name */}
                <div className="flex items-center justify-between mb-3">
                  {editingName === i ? (
                    <input
                      autoFocus
                      value={clip.name}
                      onChange={(e) => updateClip(i, { name: e.target.value })}
                      onBlur={() => setEditingName(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingName(null)}
                      className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm font-medium text-white outline-none w-36"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingName(i)}
                      className="text-sm font-semibold hover:text-blue-400 transition text-left"
                    >
                      {clip.name} ✏
                    </button>
                  )}
                  <span className="text-xs text-gray-400 tabular-nums">
                    {formatTime(clip.startSec)} – {formatTime(clip.startSec + 30)}
                  </span>
                </div>

                {/* Slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={maxStart}
                    step={1}
                    value={clip.startSec}
                    onChange={(e) => updateClip(i, { startSec: Number(e.target.value) })}
                    className="w-full accent-blue-500 h-1.5 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>0:00</span>
                    <span>{formatTime(audioDuration)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-xl font-semibold text-lg transition"
          >
            {loading ? 'Creating…' : 'Generate Videos →'}
          </button>
        </>
      )}
    </div>
  );
}
