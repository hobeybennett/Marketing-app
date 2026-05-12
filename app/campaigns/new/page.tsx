'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const TEST_SPOTIFY_URL = 'https://open.spotify.com/track/6Jv7kjGkhY2fT4yuBF3aTz';
const CTA_OPTIONS = ['Listen Now', 'Stream Now', 'Out Now', 'Play Now', 'Hear It First'];

type TextPosition = 'bottom' | 'center' | 'top';
type BgMode = 'generate' | 'upload';
type BgAnimation = 'none' | 'zoom-in' | 'zoom-out' | 'slow-pan' | 'pulse';
type TextAnimation = 'none' | 'fade-in' | 'slide-up';
type SpotifyData = { artistName: string; songTitle: string; coverArtUrl: string | null };
type Clip = { name: string; startSec: number };

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function initClips(duration: number): Clip[] {
  const step = Math.floor(duration / 5);
  return Array.from({ length: 5 }, (_, i) => ({
    name: `Section ${i + 1}`,
    startSec: Math.min(i * step, Math.max(0, duration - 30)),
  }));
}

function generateTestWav(durationSecs = 180): Blob {
  const sr = 44100, n = sr * durationSecs;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++)
    v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 0.3 * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

// ── Preview ────────────────────────────────────────────────────────────────

const BG_ANIM_CSS: Record<BgAnimation, string> = {
  'none': '',
  'zoom-in': 'hitback-zoom-in 12s ease-in-out infinite',
  'zoom-out': 'hitback-zoom-out 12s ease-in-out infinite',
  'slow-pan': 'hitback-pan 14s ease-in-out infinite',
  'pulse': 'hitback-pulse 4s ease-in-out infinite',
};

const TEXT_ANIM_CSS: Record<TextAnimation, string> = {
  'none': '',
  'fade-in': 'hitback-fade-in 1.2s ease forwards',
  'slide-up': 'hitback-slide-up 0.9s ease forwards',
};

const FONT_SIZE: Record<string, string> = {
  sm: '14px', md: '20px', lg: '28px',
};

const TEXT_POS_STYLE: Record<TextPosition, React.CSSProperties> = {
  top: { top: 32, left: 0, right: 0, position: 'absolute' },
  center: { top: '50%', left: 0, right: 0, position: 'absolute', transform: 'translateY(-50%)' },
  bottom: { bottom: 32, left: 0, right: 0, position: 'absolute' },
};

function VideoPreview({
  bgMode, bgPreview, coverArtUrl, artistName, songTitle, ctaText, textPosition,
  blurAmount, bgAnimation, textAnimation, fontSize, fontColor, fontBold, animKey,
}: {
  bgMode: BgMode; bgPreview: string | null; coverArtUrl: string | null;
  artistName: string; songTitle: string; ctaText: string; textPosition: TextPosition;
  blurAmount: number; bgAnimation: BgAnimation; textAnimation: TextAnimation;
  fontSize: 'sm' | 'md' | 'lg'; fontColor: string; fontBold: boolean; animKey: number;
}) {
  const bgSrc = bgMode === 'generate' ? coverArtUrl : bgPreview;
  const isUploadedVideo = bgMode === 'upload' && bgPreview && bgPreview.startsWith('blob');
  const titleSize = FONT_SIZE[fontSize];
  const artistSize = `${parseInt(titleSize) * 0.7}px`;
  const ctaSize = `${parseInt(titleSize) * 0.6}px`;

  return (
    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-gray-900 select-none">
      <style>{`
        @keyframes hitback-zoom-in {
          0% { transform: scale(1.05); }
          100% { transform: scale(1.4); }
        }
        @keyframes hitback-zoom-out {
          0% { transform: scale(1.4); }
          100% { transform: scale(1.05); }
        }
        @keyframes hitback-pan {
          0%, 100% { transform: scale(1.15) translateX(-6%); }
          50% { transform: scale(1.15) translateX(6%); }
        }
        @keyframes hitback-pulse {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.12); }
        }
        @keyframes hitback-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes hitback-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Background layer */}
      {bgSrc && !isUploadedVideo && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <img
            key={animKey}
            src={bgSrc}
            alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              filter: `blur(${blurAmount}px)`,
              transform: bgAnimation === 'none' ? 'scale(1.1)' : undefined,
              animation: BG_ANIM_CSS[bgAnimation] || undefined,
              willChange: 'transform',
            }}
          />
        </div>
      )}
      {isUploadedVideo && bgPreview && (
        <video
          key={animKey}
          src={bgPreview}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            filter: blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
            animation: BG_ANIM_CSS[bgAnimation] || undefined,
          }}
          autoPlay muted loop playsInline
        />
      )}
      {!bgSrc && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' }} />
      )}

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: textPosition === 'bottom'
          ? 'linear-gradient(to bottom, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.75) 100%)'
          : textPosition === 'top'
          ? 'linear-gradient(to top, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.75) 100%)'
          : 'rgba(0,0,0,0.25)',
      }} />

      {/* Text overlay */}
      <div key={`text-${animKey}`} style={{
        ...TEXT_POS_STYLE[textPosition],
        textAlign: 'center',
        padding: '0 20px',
        animation: TEXT_ANIM_CSS[textAnimation] || undefined,
      }}>
        <p style={{
          color: fontColor, fontWeight: fontBold ? 700 : 400,
          fontSize: titleSize, lineHeight: 1.2,
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          margin: 0,
        }}>
          {songTitle || 'Song Title'}
        </p>
        <p style={{
          color: fontColor, fontWeight: fontBold ? 500 : 400, opacity: 0.8,
          fontSize: artistSize, marginTop: 4,
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
        }}>
          {artistName || 'Artist Name'}
        </p>
        <div style={{
          display: 'inline-block', marginTop: 10,
          background: 'rgba(255,255,255,0.2)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 999, padding: '5px 16px',
        }}>
          <p style={{ color: fontColor, fontWeight: 600, fontSize: ctaSize, margin: 0 }}>
            {ctaText}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Pill button ────────────────────────────────────────────────────────────

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap
        ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
      {children}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotify, setSpotify] = useState<SpotifyData | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState(180);

  // Visual config
  const [bgMode, setBgMode] = useState<BgMode>('generate');
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [blurAmount, setBlurAmount] = useState(20);
  const [bgAnimation, setBgAnimation] = useState<BgAnimation>('zoom-in');
  const [textAnimation, setTextAnimation] = useState<TextAnimation>('fade-in');
  const [artistName, setArtistName] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [ctaText, setCtaText] = useState('Listen Now');
  const [customCta, setCustomCta] = useState('');
  const [textPosition, setTextPosition] = useState<TextPosition>('bottom');
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [fontColor, setFontColor] = useState('#ffffff');
  const [fontBold, setFontBold] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  // Clips
  const [clips, setClips] = useState<Clip[]>(initClips(180));
  const [editingName, setEditingName] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showEditor = !!spotify && !!audioFile;
  const activeCta = ctaText === 'custom' ? customCta : ctaText;
  const maxStart = Math.max(0, audioDuration - 30);

  function replayAnim() { setAnimKey((k) => k + 1); }

  async function lookupSpotify(url = spotifyUrl) {
    if (!url.trim()) return;
    setSpotifyLoading(true);
    setSpotifyError('');
    try {
      const res = await fetch('/api/spotify/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setSpotify(data);
      setArtistName(data.artistName);
      setSongTitle(data.songTitle);
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : 'Something went wrong');
    } finally { setSpotifyLoading(false); }
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

  function handleBgUpload(file: File | null) {
    if (!file) return;
    setBgFile(file);
    setBgPreview(URL.createObjectURL(file));
    setBgMode('upload');
    replayAnim();
  }

  function updateClip(i: number, patch: Partial<Clip>) {
    setClips((prev) => prev.map((c, j) => j === i ? { ...c, ...patch } : c));
  }

  async function useTestData() {
    setSpotifyUrl(TEST_SPOTIFY_URL);
    await lookupSpotify(TEST_SPOTIFY_URL);
    const file = new File([generateTestWav(180)], 'test-audio.wav', { type: 'audio/wav' });
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
    const visualConfig = { bgMode, blurAmount, bgAnimation, textAnimation, ctaText: activeCta, textPosition, fontSize, fontColor, fontBold };
    const formData = new FormData();
    formData.set('artistName', artistName);
    formData.set('songTitle', songTitle);
    if (spotify.coverArtUrl) formData.set('coverArtUrl', spotify.coverArtUrl);
    formData.set('audio', audioFile);
    formData.set('clips', JSON.stringify(clips));
    formData.set('visualConfig', JSON.stringify(visualConfig));
    if (bgMode === 'upload' && bgFile) formData.set('background', bgFile);
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', body: formData });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const campaign = await res.json();
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-2">
        <h1 className="text-2xl font-bold">New Campaign</h1>
        <button type="button" onClick={useTestData}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg text-gray-400 transition">
          Use test data
        </button>
      </div>

      {/* Spotify */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <p className="text-sm font-medium text-gray-300 mb-3">Paste your Spotify link</p>
        <div className="flex gap-2">
          <input type="url" value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), lookupSpotify())}
            placeholder="https://open.spotify.com/track/..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-green-500 outline-none text-sm" />
          <button type="button" onClick={() => lookupSpotify()}
            disabled={spotifyLoading || !spotifyUrl.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 px-4 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap">
            {spotifyLoading ? '…' : 'Look up'}
          </button>
        </div>
        {spotifyError && <p className="text-red-400 text-xs mt-2">{spotifyError}</p>}
        {spotify && (
          <div className="flex items-center gap-3 mt-3 bg-gray-800 rounded-lg p-2.5">
            {spotify.coverArtUrl && <Image src={spotify.coverArtUrl} alt="" width={40} height={40} className="rounded" />}
            <div>
              <p className="text-sm font-medium">{spotify.songTitle}</p>
              <p className="text-xs text-gray-400">{spotify.artistName}</p>
            </div>
            <span className="ml-auto text-green-400 text-xs">✓</span>
          </div>
        )}
      </div>

      {/* Audio */}
      {spotify && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <p className="text-sm font-medium text-gray-300 mb-3">Upload your track</p>
          <input ref={audioInputRef} type="file"
            accept=".mp3,.wav,.aiff,.m4a,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/aiff,audio/flac"
            onChange={(e) => handleAudioChange(e.target.files?.[0] ?? null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer" />
          {audioFile && <p className="text-xs text-gray-400 mt-1.5">{audioFile.name} · {formatTime(audioDuration)}</p>}
        </div>
      )}

      {showEditor && (
        <>
          {/* ── Preview ── */}
          <div className="mb-1">
            <VideoPreview
              bgMode={bgMode} bgPreview={bgPreview} coverArtUrl={spotify.coverArtUrl}
              artistName={artistName} songTitle={songTitle} ctaText={activeCta}
              textPosition={textPosition} blurAmount={blurAmount}
              bgAnimation={bgAnimation} textAnimation={textAnimation}
              fontSize={fontSize} fontColor={fontColor} fontBold={fontBold} animKey={animKey}
            />
          </div>
          <button type="button" onClick={replayAnim}
            className="w-full text-xs text-gray-500 hover:text-gray-300 py-2 mb-4 transition">
            ↺ Replay animation
          </button>

          {/* ── Background ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-3 space-y-4">
            <p className="text-sm font-semibold">Background</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setBgMode('generate'); replayAnim(); }}
                className={`py-2.5 rounded-lg text-sm font-medium border transition ${bgMode === 'generate' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                ✨ Generate
              </button>
              <button type="button" onClick={() => bgInputRef.current?.click()}
                className={`py-2.5 rounded-lg text-sm font-medium border transition ${bgMode === 'upload' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                ⬆ Upload
              </button>
            </div>
            {bgMode === 'upload' && bgFile && <p className="text-xs text-gray-400">{bgFile.name}</p>}
            <input ref={bgInputRef} type="file" accept="image/*,video/*"
              onChange={(e) => handleBgUpload(e.target.files?.[0] ?? null)} className="hidden" />

            {/* Blur */}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                <span>Blur</span>
                <span>{blurAmount}px</span>
              </div>
              <input type="range" min={0} max={40} step={1} value={blurAmount}
                onChange={(e) => setBlurAmount(Number(e.target.value))}
                className="w-full accent-blue-500 h-1.5 cursor-pointer" />
              <div className="flex justify-between text-xs text-gray-700 mt-0.5">
                <span>Sharp</span><span>Max blur</span>
              </div>
            </div>
          </div>

          {/* ── Animations ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-3 space-y-4">
            <p className="text-sm font-semibold">Animation</p>
            <div>
              <p className="text-xs text-gray-400 mb-2">Background</p>
              <div className="flex flex-wrap gap-2">
                {(['none', 'zoom-in', 'zoom-out', 'slow-pan', 'pulse'] as BgAnimation[]).map((a) => (
                  <Pill key={a} active={bgAnimation === a} onClick={() => { setBgAnimation(a); replayAnim(); }}>
                    {a === 'none' ? 'Static' : a === 'zoom-in' ? 'Zoom in' : a === 'zoom-out' ? 'Zoom out' : a === 'slow-pan' ? 'Slow pan' : 'Pulse'}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Text entrance</p>
              <div className="flex flex-wrap gap-2">
                {(['none', 'fade-in', 'slide-up'] as TextAnimation[]).map((a) => (
                  <Pill key={a} active={textAnimation === a} onClick={() => { setTextAnimation(a); replayAnim(); }}>
                    {a === 'none' ? 'Static' : a === 'fade-in' ? 'Fade in' : 'Slide up'}
                  </Pill>
                ))}
              </div>
            </div>
          </div>

          {/* ── Text overlay ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-3 space-y-4">
            <p className="text-sm font-semibold">Text overlay</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Artist</label>
                <input value={artistName} onChange={(e) => setArtistName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Title</label>
                <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              </div>
            </div>

            {/* CTA */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Call to action</p>
              <div className="flex flex-wrap gap-2">
                {CTA_OPTIONS.map((opt) => (
                  <Pill key={opt} active={ctaText === opt} onClick={() => setCtaText(opt)}>{opt}</Pill>
                ))}
                <Pill active={ctaText === 'custom'} onClick={() => setCtaText('custom')}>Custom</Pill>
              </div>
              {ctaText === 'custom' && (
                <input value={customCta} onChange={(e) => setCustomCta(e.target.value)}
                  placeholder="Enter CTA…"
                  className="w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              )}
            </div>

            {/* Font controls */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-2">Size</p>
                <div className="flex gap-1.5">
                  {(['sm', 'md', 'lg'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setFontSize(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition
                        ${fontSize === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                      {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Weight</p>
                <button type="button" onClick={() => setFontBold((b) => !b)}
                  className={`w-full py-1.5 rounded-lg text-xs font-medium border transition
                    ${fontBold ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                  {fontBold ? 'Bold' : 'Normal'}
                </button>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Colour</p>
                <label className="relative block w-full h-[34px] rounded-lg overflow-hidden border border-gray-700 cursor-pointer">
                  <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)}
                    className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
                  <div className="absolute inset-0 rounded-lg" style={{ background: fontColor }} />
                </label>
              </div>
            </div>

            {/* Position */}
            <div>
              <p className="text-xs text-gray-400 mb-2">Position</p>
              <div className="grid grid-cols-3 gap-2">
                {(['top', 'center', 'bottom'] as TextPosition[]).map((pos) => (
                  <button key={pos} type="button" onClick={() => setTextPosition(pos)}
                    className={`py-2 rounded-lg text-xs font-medium border capitalize transition
                      ${textPosition === pos ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Clips ── */}
          <div className="space-y-3 mb-6">
            <p className="text-sm font-semibold px-1">Clips</p>
            {clips.map((clip, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  {editingName === i ? (
                    <input autoFocus value={clip.name}
                      onChange={(e) => updateClip(i, { name: e.target.value })}
                      onBlur={() => setEditingName(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingName(null)}
                      className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm font-medium text-white outline-none w-36" />
                  ) : (
                    <button type="button" onClick={() => setEditingName(i)}
                      className="text-sm font-semibold hover:text-blue-400 transition">
                      {clip.name} <span className="text-gray-600 text-xs">✏</span>
                    </button>
                  )}
                  <span className="text-xs text-gray-400 tabular-nums">
                    {formatTime(clip.startSec)} – {formatTime(clip.startSec + 30)}
                  </span>
                </div>
                <input type="range" min={0} max={maxStart} step={1} value={clip.startSec}
                  onChange={(e) => updateClip(i, { startSec: Number(e.target.value) })}
                  className="w-full accent-blue-500 h-1.5 cursor-pointer" />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>0:00</span><span>{formatTime(audioDuration)}</span>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-xl font-semibold text-lg transition">
            {loading ? 'Creating…' : 'Generate Videos →'}
          </button>
        </>
      )}
    </div>
  );
}
