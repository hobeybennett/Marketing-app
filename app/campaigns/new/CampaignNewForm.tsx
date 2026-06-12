'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const TEST_SPOTIFY_URL = 'https://open.spotify.com/track/6Jv7kjGkhY2fT4yuBF3aTz';
const CTA_OPTIONS = ['Listen Now', 'Stream Now', 'Out Now', 'Play Now', 'Hear It First'];

type VAlign = 'top' | 'center' | 'bottom';
type HAlign = 'left' | 'center' | 'right';
type FontSize = 'sm' | 'md' | 'lg';
type FontFamily = 'sans' | 'serif' | 'display' | 'mono' | 'narrow';
type BgMode = 'generate' | 'upload';
type BgAnimation = 'none' | 'zoom-in' | 'zoom-out' | 'slow-pan' | 'pulse';
type TextAnimation = 'none' | 'fade-in' | 'slide-up';
type TextLayer = 'heading' | 'subheading' | 'cta';
type Mode = 'quick' | 'custom';

type TextLayerStyle = {
  vAlign: VAlign;
  hAlign: HAlign;
  fontSize: FontSize;
  fontColor: string;
  fontFamily: FontFamily;
  fontBold: boolean;
};

type SpotifyData = { artistName: string; songTitle: string; coverArtUrl: string | null };
type Clip = { name: string; startSec: number };

// ── Constants ──────────────────────────────────────────────────────────────

const FONT_SIZE_PX: Record<FontSize, number> = { sm: 13, md: 18, lg: 26 };

const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  sans: 'system-ui, -apple-system, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'Impact, "Arial Black", sans-serif',
  mono: '"Courier New", Courier, monospace',
  narrow: '"Arial Narrow", Arial, sans-serif',
};

const FONT_FAMILY_LABEL: Record<FontFamily, string> = {
  sans: 'Clean', serif: 'Elegant', display: 'Impact', mono: 'Mono', narrow: 'Narrow',
};

const BG_ANIM_CSS: Record<BgAnimation, string> = {
  'none': '',
  'zoom-in': 'promohit-zoom-in 12s ease-in-out infinite',
  'zoom-out': 'promohit-zoom-out 12s ease-in-out infinite',
  'slow-pan': 'promohit-pan 14s ease-in-out infinite',
  'pulse': 'promohit-pulse 4s ease-in-out infinite',
};

const TEXT_ANIM_CSS: Record<TextAnimation, string> = {
  'none': '',
  'fade-in': 'promohit-fade-in 1.2s ease forwards',
  'slide-up': 'promohit-slide-up 0.9s ease forwards',
};

const VPOS_STYLE: Record<VAlign, React.CSSProperties> = {
  top: { position: 'absolute', top: 20, left: 0, right: 0 },
  center: { position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' },
  bottom: { position: 'absolute', bottom: 20, left: 0, right: 0 },
};

const HALIGN_STYLE: Record<HAlign, React.CSSProperties> = {
  left: { textAlign: 'left', paddingLeft: 16, paddingRight: 8 },
  center: { textAlign: 'center', paddingLeft: 16, paddingRight: 16 },
  right: { textAlign: 'right', paddingLeft: 8, paddingRight: 16 },
};

const DEFAULT_HEADING: TextLayerStyle = {
  vAlign: 'bottom', hAlign: 'center', fontSize: 'lg', fontColor: '#ffffff', fontFamily: 'sans', fontBold: true,
};
const DEFAULT_SUBHEADING: TextLayerStyle = {
  vAlign: 'bottom', hAlign: 'center', fontSize: 'md', fontColor: '#ffffff', fontFamily: 'sans', fontBold: false,
};
const DEFAULT_CTA: TextLayerStyle = {
  vAlign: 'bottom', hAlign: 'center', fontSize: 'sm', fontColor: '#ffffff', fontFamily: 'sans', fontBold: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── VideoPreview ───────────────────────────────────────────────────────────

function VideoPreview({
  bgMode, bgPreview, coverArtUrl, artistName, songTitle, ctaText,
  blurAmount, bgAnimation, textAnimation, heading, subheading, cta, animKey,
}: {
  bgMode: BgMode; bgPreview: string | null; coverArtUrl: string | null;
  artistName: string; songTitle: string; ctaText: string;
  blurAmount: number; bgAnimation: BgAnimation; textAnimation: TextAnimation;
  heading: TextLayerStyle; subheading: TextLayerStyle; cta: TextLayerStyle;
  animKey: number;
}) {
  const bgSrc = bgMode === 'generate' ? coverArtUrl : bgPreview;
  const isUploadedVideo = bgMode === 'upload' && !!bgPreview?.startsWith('blob');

  type Item = { key: string; hAlign: HAlign; node: React.ReactNode };
  const groups: Record<VAlign, Item[]> = { top: [], center: [], bottom: [] };

  groups[heading.vAlign].push({
    key: 'heading', hAlign: heading.hAlign,
    node: (
      <p style={{
        color: heading.fontColor, fontWeight: heading.fontBold ? 700 : 400,
        fontSize: FONT_SIZE_PX[heading.fontSize], fontFamily: FONT_FAMILY_CSS[heading.fontFamily],
        lineHeight: 1.2, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.6)',
      }}>{songTitle || 'Song Title'}</p>
    ),
  });

  groups[subheading.vAlign].push({
    key: 'subheading', hAlign: subheading.hAlign,
    node: (
      <p style={{
        color: subheading.fontColor, fontWeight: subheading.fontBold ? 700 : 400,
        fontSize: FONT_SIZE_PX[subheading.fontSize], fontFamily: FONT_FAMILY_CSS[subheading.fontFamily],
        lineHeight: 1.2, margin: '4px 0 0', opacity: 0.85,
        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
      }}>{artistName || 'Artist Name'}</p>
    ),
  });

  groups[cta.vAlign].push({
    key: 'cta', hAlign: cta.hAlign,
    node: (
      <div style={{ display: 'inline-block', marginTop: 8 }}>
        <div style={{
          background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '4px 14px',
        }}>
          <p style={{
            color: cta.fontColor, fontWeight: cta.fontBold ? 700 : 600,
            fontSize: FONT_SIZE_PX[cta.fontSize], fontFamily: FONT_FAMILY_CSS[cta.fontFamily],
            margin: 0,
          }}>{ctaText}</p>
        </div>
      </div>
    ),
  });

  return (
    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-gray-900 select-none">
      <style>{`
        @keyframes promohit-zoom-in {
          0% { transform: scale(1.05); } 100% { transform: scale(1.4); }
        }
        @keyframes promohit-zoom-out {
          0% { transform: scale(1.4); } 100% { transform: scale(1.05); }
        }
        @keyframes promohit-pan {
          0%, 100% { transform: scale(1.15) translateX(-6%); }
          50%       { transform: scale(1.15) translateX(6%); }
        }
        @keyframes promohit-pulse {
          0%, 100% { transform: scale(1.05); } 50% { transform: scale(1.12); }
        }
        @keyframes promohit-fade-in {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes promohit-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {bgSrc && !isUploadedVideo && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <img key={animKey} src={bgSrc} alt="" style={{
            width: '100%', height: '100%', objectFit: 'cover',
            filter: `blur(${blurAmount}px)`,
            transform: bgAnimation === 'none' ? 'scale(1.1)' : undefined,
            animation: BG_ANIM_CSS[bgAnimation] || undefined,
            willChange: 'transform',
          }} />
        </div>
      )}
      {isUploadedVideo && bgPreview && (
        <video key={animKey} src={bgPreview} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          filter: blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
          animation: BG_ANIM_CSS[bgAnimation] || undefined,
        }} autoPlay muted loop playsInline />
      )}
      {!bgSrc && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' }} />
      )}

      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 28%, transparent 68%, rgba(0,0,0,0.55) 100%)',
      }} />

      {(['top', 'center', 'bottom'] as VAlign[]).map(vAlign => {
        const items = groups[vAlign];
        if (items.length === 0) return null;
        return (
          <div key={`${vAlign}-${animKey}`} style={{
            ...VPOS_STYLE[vAlign],
            animation: TEXT_ANIM_CSS[textAnimation] || undefined,
          }}>
            {items.map(item => (
              <div key={item.key} style={HALIGN_STYLE[item.hAlign]}>
                {item.node}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Reusable controls ──────────────────────────────────────────────────────

function Pill({ active, onClick, children, style }: {
  active: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <button type="button" onClick={onClick} style={style}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap
        ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
      {children}
    </button>
  );
}

function SegmentBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`py-2 rounded-lg text-xs font-medium border capitalize transition
        ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
      {children}
    </button>
  );
}

// ── Section toggle header ──────────────────────────────────────────────────

function SectionHeader({ title, expanded, onRecommend, onCustomise }: {
  title: string;
  expanded: boolean;
  onRecommend: () => void;
  onCustomise: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
        <button type="button" onClick={onRecommend}
          className={`px-3 py-1.5 font-medium transition ${!expanded ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          Recommended
        </button>
        <button type="button" onClick={onCustomise}
          className={`px-3 py-1.5 font-medium transition border-l border-gray-700 ${expanded ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
          Customise
        </button>
      </div>
    </div>
  );
}

// ── TextLayerEditor ────────────────────────────────────────────────────────

function TextLayerEditor({ style, onChange }: {
  style: TextLayerStyle; onChange: (patch: Partial<TextLayerStyle>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Vertical</p>
        <div className="grid grid-cols-3 gap-2">
          {(['top', 'center', 'bottom'] as VAlign[]).map(v => (
            <SegmentBtn key={v} active={style.vAlign === v} onClick={() => onChange({ vAlign: v })}>
              {v}
            </SegmentBtn>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1.5">Horizontal</p>
        <div className="grid grid-cols-3 gap-2">
          {(['left', 'center', 'right'] as HAlign[]).map(h => (
            <SegmentBtn key={h} active={style.hAlign === h} onClick={() => onChange({ hAlign: h })}>
              {h}
            </SegmentBtn>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Size</p>
          <div className="flex gap-1">
            {(['sm', 'md', 'lg'] as FontSize[]).map(s => (
              <button key={s} type="button" onClick={() => onChange({ fontSize: s })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition
                  ${style.fontSize === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Weight</p>
          <button type="button" onClick={() => onChange({ fontBold: !style.fontBold })}
            className={`w-full py-1.5 rounded-lg text-xs font-medium border transition
              ${style.fontBold ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
            {style.fontBold ? 'Bold' : 'Normal'}
          </button>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Colour</p>
          <label className="relative block w-full h-[34px] rounded-lg overflow-hidden border border-gray-700 cursor-pointer">
            <input type="color" value={style.fontColor} onChange={(e) => onChange({ fontColor: e.target.value })}
              className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
            <div className="absolute inset-0 rounded-lg" style={{ background: style.fontColor }} />
          </label>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1.5">Font</p>
        <div className="flex flex-wrap gap-2">
          {(['sans', 'serif', 'display', 'mono', 'narrow'] as FontFamily[]).map(f => (
            <button key={f} type="button" onClick={() => onChange({ fontFamily: f })}
              style={{ fontFamily: FONT_FAMILY_CSS[f] }}
              className={`px-2.5 py-1 rounded-lg text-xs border transition
                ${style.fontFamily === f ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
              {FONT_FAMILY_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────

export default function CampaignNewForm() {
  const router = useRouter();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('quick');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotify, setSpotify] = useState<SpotifyData | null>(null);
  const [saveSpotifyUrl, setSaveSpotifyUrl] = useState(true);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState(180);

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

  const [headingStyle, setHeadingStyle] = useState<TextLayerStyle>(DEFAULT_HEADING);
  const [subheadingStyle, setSubheadingStyle] = useState<TextLayerStyle>(DEFAULT_SUBHEADING);
  const [ctaStyle, setCtaStyle] = useState<TextLayerStyle>(DEFAULT_CTA);
  const [selectedLayer, setSelectedLayer] = useState<TextLayer>('heading');

  const [animKey, setAnimKey] = useState(0);
  const [clips, setClips] = useState<Clip[]>(initClips(180));
  const [editingName, setEditingName] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);

  const showEditor = !!spotify && !!audioFile;
  const activeCta = ctaText === 'custom' ? customCta : ctaText;
  const maxStart = Math.max(0, audioDuration - 30);

  function replayAnim() { setAnimKey((k) => k + 1); }

  function updateLayer(layer: TextLayer, patch: Partial<TextLayerStyle>) {
    if (layer === 'heading') setHeadingStyle(p => ({ ...p, ...patch }));
    else if (layer === 'subheading') setSubheadingStyle(p => ({ ...p, ...patch }));
    else setCtaStyle(p => ({ ...p, ...patch }));
  }

  const currentLayerStyle =
    selectedLayer === 'heading' ? headingStyle
    : selectedLayer === 'subheading' ? subheadingStyle
    : ctaStyle;

  function resetAllToDefaults(dur = audioDuration) {
    setBgMode('generate'); setBgFile(null); setBgPreview(null); setBlurAmount(20);
    setBgAnimation('zoom-in'); setTextAnimation('fade-in');
    setCtaText('Listen Now'); setCustomCta('');
    setHeadingStyle(DEFAULT_HEADING); setSubheadingStyle(DEFAULT_SUBHEADING); setCtaStyle(DEFAULT_CTA);
    setClips(initClips(dur));
    setExpanded(new Set());
    replayAnim();
  }

  function openSection(key: string) {
    setExpanded(prev => new Set([...prev, key]));
  }

  function closeSection(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.delete(key); return n; });
  }

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
    setClips(prev => prev.map((c, j) => j === i ? { ...c, ...patch } : c));
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
    const visualConfig = {
      bgMode, blurAmount, bgAnimation, textAnimation, ctaText: activeCta,
      heading: headingStyle, subheading: subheadingStyle, cta: ctaStyle,
    };
    const formData = new FormData();
    formData.set('artistName', artistName);
    formData.set('songTitle', songTitle);
    if (spotify.coverArtUrl) formData.set('coverArtUrl', spotify.coverArtUrl);
    formData.set('audio', audioFile);
    formData.set('clips', JSON.stringify(clips));
    formData.set('visualConfig', JSON.stringify(visualConfig));
    if (bgMode === 'upload' && bgFile) formData.set('background', bgFile);
    if (saveSpotifyUrl && spotifyUrl.trim()) formData.set('spotifyUrl', spotifyUrl.trim());
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', body: formData });
      if (res.status === 402) { setShowPaywall(true); setLoading(false); return; }
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

      {/* Paywall modal */}
      {showPaywall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full text-center">
            <h2 className="font-display text-xl font-700 mb-2">Unlock Another Campaign</h2>
            <p className="text-sm text-gray-400 mb-5">
              Each additional campaign is a one-time payment of $4.99.
            </p>
            <a href="/api/checkout" className="btn-primary block w-full px-6 py-3 text-lg mb-3">
              Get Campaign Credit — $4.99
            </a>
            <button type="button" onClick={() => setShowPaywall(false)}
              className="text-sm text-gray-500 hover:text-gray-300 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-4">
        <h1 className="font-display text-2xl font-700">New Campaign</h1>
        <button type="button" onClick={useTestData}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg text-gray-400 transition">
          Use test data
        </button>
      </div>

      {/* ── Mode picker ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button type="button"
          onClick={() => { setMode('quick'); resetAllToDefaults(); }}
          className={`p-4 rounded-xl border text-left transition ${mode === 'quick'
            ? 'bg-violet-900/40 border-violet-600'
            : 'bg-gray-900 border-gray-800 hover:border-gray-600'}`}>
          <div className="text-2xl mb-2">⚡</div>
          <p className={`font-semibold text-sm ${mode === 'quick' ? 'text-white' : 'text-gray-300'}`}>
            Quick Launch
          </p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Recommended settings, launch in one click
          </p>
        </button>
        <button type="button"
          onClick={() => setMode('custom')}
          className={`p-4 rounded-xl border text-left transition ${mode === 'custom'
            ? 'bg-violet-900/40 border-violet-600'
            : 'bg-gray-900 border-gray-800 hover:border-gray-600'}`}>
          <div className="text-2xl mb-2">🎨</div>
          <p className={`font-semibold text-sm ${mode === 'custom' ? 'text-white' : 'text-gray-300'}`}>
            Customise
          </p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Choose background, animations &amp; clip positions
          </p>
        </button>
      </div>

      {/* ── Spotify ─────────────────────────────────────────────────────── */}
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
        {spotify && (
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={saveSpotifyUrl}
              onChange={(e) => setSaveSpotifyUrl(e.target.checked)}
              className="w-4 h-4 accent-green-500" />
            <span className="text-xs text-gray-400">Add Spotify link to smart link page</span>
          </label>
        )}
      </div>

      {/* ── Audio upload ─────────────────────────────────────────────────── */}
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

      {/* ── Editor (shown after both Spotify + audio) ─────────────────── */}
      {showEditor && (
        <>
          {/* Preview */}
          <div className="mb-1">
            <VideoPreview
              bgMode={bgMode} bgPreview={bgPreview} coverArtUrl={spotify.coverArtUrl}
              artistName={artistName} songTitle={songTitle} ctaText={activeCta}
              blurAmount={blurAmount} bgAnimation={bgAnimation} textAnimation={textAnimation}
              heading={headingStyle} subheading={subheadingStyle} cta={ctaStyle}
              animKey={animKey}
            />
          </div>
          <button type="button" onClick={replayAnim}
            className="w-full text-xs text-gray-500 hover:text-gray-300 py-2 mb-4 transition">
            ↺ Replay animation
          </button>

          {/* ── Quick Launch summary ────────────────────────────────────── */}
          {mode === 'quick' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
              <p className="text-sm font-semibold text-gray-200 mb-3">What we&apos;ll create for you</p>
              <ul className="space-y-2.5">
                {[
                  'Blurred cover art background with zoom-in animation',
                  '5 clips, evenly spread across your track',
                  'Song title + artist name overlay, fade-in entrance',
                  '"Listen Now" call to action',
                  'AI-written ad copy for each video',
                  '3 target audiences — interest, retargeting, lookalike',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-400">
                    <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setMode('custom')}
                className="mt-4 text-xs text-violet-400 hover:text-violet-300 transition">
                Want to customise instead? →
              </button>
            </div>
          )}

          {/* ── Custom sections ─────────────────────────────────────────── */}
          {mode === 'custom' && (
            <>
              {/* Background */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-3">
                <SectionHeader
                  title="Background"
                  expanded={expanded.has('bg')}
                  onRecommend={() => {
                    setBgMode('generate'); setBgFile(null); setBgPreview(null); setBlurAmount(20);
                    replayAnim(); closeSection('bg');
                  }}
                  onCustomise={() => openSection('bg')}
                />
                {!expanded.has('bg') ? (
                  <p className="text-xs text-gray-500">Cover art · 20px blur · Zoom-in animation</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setBgMode('generate'); replayAnim(); }}
                        className={`py-2.5 rounded-lg text-sm font-medium border transition
                          ${bgMode === 'generate' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                        ✨ Generate
                      </button>
                      <button type="button" onClick={() => bgInputRef.current?.click()}
                        className={`py-2.5 rounded-lg text-sm font-medium border transition
                          ${bgMode === 'upload' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                        ⬆ Upload
                      </button>
                    </div>
                    {bgMode === 'upload' && bgFile && <p className="text-xs text-gray-400">{bgFile.name}</p>}
                    <input ref={bgInputRef} type="file" accept="image/*,video/*"
                      onChange={(e) => handleBgUpload(e.target.files?.[0] ?? null)} className="hidden" />
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                        <span>Blur</span><span>{blurAmount}px</span>
                      </div>
                      <input type="range" min={0} max={40} step={1} value={blurAmount}
                        onChange={(e) => setBlurAmount(Number(e.target.value))}
                        className="w-full accent-blue-500 h-1.5 cursor-pointer" />
                      <div className="flex justify-between text-xs text-gray-700 mt-0.5">
                        <span>Sharp</span><span>Max blur</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Animation */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-3">
                <SectionHeader
                  title="Animation"
                  expanded={expanded.has('anim')}
                  onRecommend={() => {
                    setBgAnimation('zoom-in'); setTextAnimation('fade-in');
                    replayAnim(); closeSection('anim');
                  }}
                  onCustomise={() => openSection('anim')}
                />
                {!expanded.has('anim') ? (
                  <p className="text-xs text-gray-500">Background: Zoom in · Text entrance: Fade in</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Background</p>
                      <div className="flex flex-wrap gap-2">
                        {(['none', 'zoom-in', 'zoom-out', 'slow-pan', 'pulse'] as BgAnimation[]).map(a => (
                          <Pill key={a} active={bgAnimation === a} onClick={() => { setBgAnimation(a); replayAnim(); }}>
                            {a === 'none' ? 'Static' : a === 'zoom-in' ? 'Zoom in' : a === 'zoom-out' ? 'Zoom out' : a === 'slow-pan' ? 'Slow pan' : 'Pulse'}
                          </Pill>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Text entrance</p>
                      <div className="flex flex-wrap gap-2">
                        {(['none', 'fade-in', 'slide-up'] as TextAnimation[]).map(a => (
                          <Pill key={a} active={textAnimation === a} onClick={() => { setTextAnimation(a); replayAnim(); }}>
                            {a === 'none' ? 'Static' : a === 'fade-in' ? 'Fade in' : 'Slide up'}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Text */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-3">
                <SectionHeader
                  title="Text"
                  expanded={expanded.has('text')}
                  onRecommend={() => {
                    setCtaText('Listen Now'); setCustomCta('');
                    setHeadingStyle(DEFAULT_HEADING); setSubheadingStyle(DEFAULT_SUBHEADING); setCtaStyle(DEFAULT_CTA);
                    closeSection('text');
                  }}
                  onCustomise={() => openSection('text')}
                />
                {!expanded.has('text') ? (
                  <p className="text-xs text-gray-500">Song title + artist · White · &quot;Listen Now&quot; CTA</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Artist</label>
                        <input value={artistName} onChange={(e) => setArtistName(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Title</label>
                        <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-2">Call to action</p>
                      <div className="flex flex-wrap gap-2">
                        {CTA_OPTIONS.map(opt => (
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

                    <div className="border-t border-gray-800 pt-4">
                      <p className="text-xs text-gray-500 mb-2">Style</p>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {(['heading', 'subheading', 'cta'] as TextLayer[]).map(layer => (
                          <button key={layer} type="button" onClick={() => setSelectedLayer(layer)}
                            className={`py-2 rounded-lg text-xs font-medium border transition
                              ${selectedLayer === layer ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                            {layer === 'heading' ? 'Heading' : layer === 'subheading' ? 'Subheading' : 'CTA'}
                          </button>
                        ))}
                      </div>
                      <TextLayerEditor style={currentLayerStyle} onChange={(patch) => updateLayer(selectedLayer, patch)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Clips */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-3">
                <SectionHeader
                  title="Clips"
                  expanded={expanded.has('clips')}
                  onRecommend={() => { setClips(initClips(audioDuration)); closeSection('clips'); }}
                  onCustomise={() => openSection('clips')}
                />
                {!expanded.has('clips') ? (
                  <p className="text-xs text-gray-500">5 clips · Evenly spaced across your track</p>
                ) : (
                  <div className="space-y-3 mt-1">
                    {clips.map((clip, i) => (
                      <div key={i} className="bg-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          {editingName === i ? (
                            <input autoFocus value={clip.name}
                              onChange={(e) => updateClip(i, { name: e.target.value })}
                              onBlur={() => setEditingName(null)}
                              onKeyDown={(e) => e.key === 'Enter' && setEditingName(null)}
                              className="bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-sm font-medium text-white outline-none w-36" />
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
                )}
              </div>
            </>
          )}

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button type="button" onClick={handleSubmit} disabled={loading}
            className="btn-primary w-full px-6 py-3 text-lg disabled:opacity-40 disabled:cursor-not-allowed mt-3">
            {loading ? 'Creating…' : mode === 'quick' ? '⚡ Generate Videos' : 'Generate Videos →'}
          </button>
        </>
      )}
    </div>
  );
}
