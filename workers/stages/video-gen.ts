import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

const CTA_OPTIONS = ['Listen Now', 'Stream Today', 'Hear It First', 'Play Now', 'Out Now'];

interface ElementStyle {
  vAlign?: string;
  hAlign?: string;
  fontSize?: 'sm' | 'md' | 'lg';
  fontColor?: string;
  fontFamily?: string;
  fontBold?: boolean;
}

interface VisualConfig {
  bgMode?: 'generate' | 'upload';
  blurAmount?: number;
  bgAnimation?: string;
  textAnimation?: string;
  ctaText?: string;
  backgroundPath?: string;
  heading?: ElementStyle;
  subheading?: ElementStyle;
  cta?: ElementStyle;
  dailyBudgetUsd?: number;
  hookText?: string;
  artMode?: 'art' | 'color' | 'texture' | 'pattern';
  backgroundTexture?: string;
  backgroundPattern?: string;
  showAlbumArt?: boolean;
}

const W = 1080;
const H = 1920; // 9:16 — Instagram Reels/Stories vertical (mobile) format
const ART_SIZE = 860;
const ART_X = Math.round((W - ART_SIZE) / 2); // 110
const ART_Y = 110;
const ART_BOTTOM = ART_Y + ART_SIZE; // 970
const TEXT_PAD = 72;
const MAX_TEXT_W = 700;

// ── Fonts ─────────────────────────────────────────────────────────────────────
const FONTS_DIR = path.join(__dirname, '../../assets/fonts');

function font(name: string): string {
  const p = path.join(FONTS_DIR, name);
  return fs.existsSync(p) ? p : path.join(FONTS_DIR, 'Montserrat-ExtraBold.ttf');
}

const FONTS = {
  bebas:       font('BebasNeue-Regular.ttf'),    // tall, cinematic
  oswald:      font('Oswald-Bold.ttf'),           // condensed, punchy
  anton:       font('Anton-Regular.ttf'),         // ultra-bold impact
  raleway:     font('Raleway-ExtraBold.ttf'),     // elegant geometric
  playfair:    font('PlayfairDisplay-Bold.ttf'),  // editorial serif
  montserrat:  font('Montserrat-ExtraBold.ttf'),
  montserratB: font('Montserrat-Bold.ttf'),
};

// ── Animation presets (one per clip) ─────────────────────────────────────────
// Each preset defines:
//   bgFilter   — filter chain for background (receives [bg_raw], outputs [bg])
//   hookFont   — font for the genre/hook line
//   ctaFont    — font for the CTA
//   hookAlpha  — FFmpeg alpha expression (function of t)
//   ctaAlpha   — FFmpeg alpha expression
//   hookY      — y position expression or number
//   ctaY       — y position expression or number

interface Preset {
  name: string;
  bgFilter: (blur: number) => string;
  hookFont: string;
  ctaFont: string;
  hookAlpha: string;
  ctaAlpha: string;
  hookYExpr: (y: number) => string;
  ctaYExpr: (y: number) => string;
}

const PRESETS: Preset[] = [
  // 0 ── Slow Burn: smooth zoom-in, Bebas Neue, clean fade ──────────────────
  {
    name: 'slow-burn',
    bgFilter: (blur) => [
      `[0:v]scale=1512:1512:force_original_aspect_ratio=increase,crop=1512:1512`,
      blur > 0 ? `,boxblur=${blur}:2` : '',
      `[bg_large]`,
      `;[bg_large]zoompan=z='min(1+0.0003*on,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1800:s=${W}x${H}:fps=30[bg]`,
    ].join(''),
    hookFont: FONTS.bebas,
    ctaFont: FONTS.bebas,
    hookAlpha: `alpha='if(lt(t,0.6),t/0.6,1)'`,
    ctaAlpha:  `alpha='if(lt(t,0.5),0,if(lt(t,1.1),(t-0.5)/0.6,1))'`,
    hookYExpr: (y) => `${y}`,
    ctaYExpr:  (y) => `${y}`,
  },

  // 1 ── Cinematic Pan: left→right drift, Oswald, slide-up entrance ─────────
  {
    name: 'cinematic-pan',
    bgFilter: (blur) => [
      `[0:v]scale=1440:1080:force_original_aspect_ratio=increase,crop=1440:1080`,
      blur > 0 ? `,boxblur=${blur}:2` : '',
      `[bg_wide]`,
      `;[bg_wide]crop=${W}:${H}:'min((1440-1080)*min(t/28\\,1)\\,360)':0[bg]`,
    ].join(''),
    hookFont: FONTS.oswald,
    ctaFont: FONTS.montserratB,
    hookAlpha: `alpha='if(lt(t,0.7),t/0.7,1)'`,
    ctaAlpha:  `alpha='if(lt(t,0.4),0,if(lt(t,0.9),(t-0.4)/0.5,1))'`,
    hookYExpr: (y) => `${y}+40*max(0,1-t/0.6)`,   // slides down into position
    ctaYExpr:  (y) => `${y}`,
  },

  // 2 ── Pull Back: zoom-out reveal, Anton, fast pop-in ─────────────────────
  {
    name: 'pull-back',
    bgFilter: (blur) => [
      `[0:v]scale=1512:1512:force_original_aspect_ratio=increase,crop=1512:1512`,
      blur > 0 ? `,boxblur=${blur}:2` : '',
      `[bg_large]`,
      `;[bg_large]zoompan=z='max(1.3-0.0003*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1800:s=${W}x${H}:fps=30[bg]`,
    ].join(''),
    hookFont: FONTS.anton,
    ctaFont: FONTS.oswald,
    hookAlpha: `alpha='if(lt(t,0.35),t/0.35,1)'`,
    ctaAlpha:  `alpha='if(lt(t,0.6),0,if(lt(t,1.0),(t-0.6)/0.4,1))'`,
    hookYExpr: (y) => `${y}`,
    ctaYExpr:  (y) => `${y}+30*max(0,1-max(0,(t-0.5))/0.5)`, // slides up
  },

  // 3 ── Diagonal Drift: Ken Burns diag, Raleway, delayed reveal ────────────
  {
    name: 'diagonal-drift',
    bgFilter: (blur) => [
      `[0:v]scale=1512:1512:force_original_aspect_ratio=increase,crop=1512:1512`,
      blur > 0 ? `,boxblur=${blur}:2` : '',
      `[bg_large]`,
      `;[bg_large]zoompan=z='min(1.05+0.0002*on,1.25)':x='max(0,min(iw-iw/zoom,iw*0.15*min(on/900,1)))':y='max(0,min(ih-ih/zoom,ih*0.12*min(on/900,1)))':d=1800:s=${W}x${H}:fps=30[bg]`,
    ].join(''),
    hookFont: FONTS.raleway,
    ctaFont: FONTS.raleway,
    hookAlpha: `alpha='if(lt(t,0.5),t/0.5,1)'`,
    ctaAlpha:  `alpha='if(lt(t,0.7),0,if(lt(t,1.3),(t-0.7)/0.6,1))'`,
    hookYExpr: (y) => `${y}`,
    ctaYExpr:  (y) => `${y}`,
  },

  // 4 ── Editorial: static bg, Playfair serif, elegant staggered reveal ─────
  {
    name: 'editorial',
    bgFilter: (blur) => [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
      blur > 0 ? `,boxblur=${blur}:2` : '',
      `[bg]`,
    ].join(''),
    hookFont: FONTS.playfair,
    ctaFont: FONTS.montserratB,
    hookAlpha: `alpha='if(lt(t,1.0),t/1.0,1)'`,    // slow graceful fade
    ctaAlpha:  `alpha='if(lt(t,0.8),0,if(lt(t,1.6),(t-0.8)/0.8,1))'`,
    hookYExpr: (y) => `${y}`,
    ctaYExpr:  (y) => `${y}`,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function findFont(candidates: string[]): string {
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[candidates.length - 1];
}

function dynamicFontSize(text: string, base: number, min = 32): number {
  const est = text.length * base * 0.58;
  if (est <= MAX_TEXT_W) return base;
  return Math.max(Math.floor(MAX_TEXT_W / (text.length * 0.58)), min);
}

function toFFColor(hex: string | undefined, alpha = '1.0'): string {
  if (!hex) return `0xFFFFFF@${alpha}`;
  return `0x${hex.replace('#', '').toUpperCase()}@${alpha}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export type Lyric = { text: string; start: number; end: number };

// The lyric lines that fall inside a clip's [segStart, segEnd] window, re-based
// to the clip's own 0-based timeline (clips start at t=0 in ffmpeg).
export function clipLyrics(all: Lyric[] | null, segStart: number, segEnd: number): Lyric[] | undefined {
  if (!all || all.length === 0) return undefined;
  const out = all
    .filter((l) => l.end > segStart && l.start < segEnd)
    .map((l) => ({
      text: l.text,
      start: Math.max(0, l.start - segStart),
      end: Math.min(segEnd - segStart, l.end - segStart),
    }))
    .filter((l) => l.end > l.start && l.text.trim());
  return out.length ? out : undefined;
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

function esc(text: string): string {
  return text
    .replace(/\\/g, '/')
    .replace(/'/g, '’')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}

// ── Main worker ───────────────────────────────────────────────────────────────

export async function runVideoGen(campaignId: string) {
  console.log(`[video-gen] runVideoGen ENTRY for ${campaignId}`);
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { segments: { orderBy: { index: 'asc' } } },
  });
  console.log(`[video-gen] loaded campaign with ${campaign.segments.length} segments`);

  await prisma.videoCreative.deleteMany({ where: { campaignId } });

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const videoDir = path.join(uploadDir, campaignId, 'videos');
  fs.mkdirSync(videoDir, { recursive: true });

  const visualConfig: VisualConfig | null =
    campaign.visualConfig ? (campaign.visualConfig as VisualConfig) : null;

  const bgPath = visualConfig?.backgroundPath as string | undefined;
  const coverArtPath = campaign.coverArtUrl;

  // Paid AI video: download the chosen clip once and use it as the looped
  // background for every creative. Falls back to the normal background on failure.
  let aiBgPath: string | undefined;
  const c = campaign as any;
  if (c.aiVideoStatus === 'SELECTED' && c.aiVideoChoiceUrl) {
    const dest = path.join(uploadDir, campaignId, 'ai_bg.mp4');
    try {
      await downloadToFile(c.aiVideoChoiceUrl as string, dest);
      aiBgPath = dest;
      console.log(`[video-gen] using AI background for campaign ${campaignId}`);
    } catch (err) {
      console.warn('[video-gen] AI background download failed, using default:', err instanceof Error ? err.message : err);
    }
  }

  // Timed lyrics for the whole track (if transcribed) — sliced per clip below.
  const allLyrics = Array.isArray((campaign as any).lyrics)
    ? ((campaign as any).lyrics as Lyric[])
    : null;

  // Render segments SEQUENTIALLY. Parallel rendering thrashed Railway's small CPU
  // (3 concurrent campaigns × 5 ffmpeg per campaign = 15 processes). The 'fast'
  // preset (crf 19) keeps each render well under the per-clip timeout.
  const tAll = Date.now();
  const failures: string[] = [];
  for (const segment of campaign.segments) {
    const vc = visualConfig ?? {};
    const ctaText = visualConfig?.ctaText || CTA_OPTIONS[segment.index % CTA_OPTIONS.length];
    const outputFile = path.join(videoDir, `creative_${segment.index}.mp4`);
    const bgSrc = (vc.bgMode === 'upload' && bgPath) ? bgPath : coverArtPath;

    if (!fs.existsSync(segment.fileUrl)) {
      failures.push(`segment ${segment.index}: audio file missing at ${segment.fileUrl}`);
      continue;
    }
    if (!fs.existsSync(coverArtPath)) {
      failures.push(`segment ${segment.index}: cover art missing at ${coverArtPath}`);
      continue;
    }

    const t0 = Date.now();
    console.log(`[video-gen] campaign ${campaignId} segment ${segment.index} starting`);
    try {
      await withTimeout(generateVideo({
        bgSrc,
        coverArtPath,
        audio: segment.fileUrl,
        output: outputFile,
        ctaText,
        genre: (campaign as any).genre as string | undefined,
        artistName: campaign.artistName ?? undefined,
        visualConfig,
        presetIndex: segment.index,
        aiBgPath,
        lyrics: clipLyrics(allLyrics, segment.startSec, segment.endSec),
      }), 3 * 60 * 1000, `video-gen segment ${segment.index}`);

      const thumbFile = outputFile.replace('.mp4', '_thumb.jpg');
      await withTimeout(new Promise<void>((resolve) => {
        ffmpeg(outputFile)
          .outputOptions(['-ss 00:00:01', '-vframes 1', '-q:v 3'])
          .output(thumbFile)
          .on('end', () => resolve())
          .on('error', () => resolve())
          .run();
      }), 30 * 1000, `thumbnail segment ${segment.index}`).catch(() => {});

      await prisma.videoCreative.create({
        data: { campaignId, segmentId: segment.id, fileUrl: outputFile, ctaText },
      });
      console.log(`[video-gen] segment ${segment.index} done in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[video-gen] segment ${segment.index} failed:`, msg);
      failures.push(`segment ${segment.index}: ${msg}`);
    }
  }
  console.log(`[video-gen] all segments done in ${Math.round((Date.now() - tAll) / 1000)}s (${failures.length} failed)`);

  if (failures.length === campaign.segments.length) {
    throw new Error(`All ${failures.length} video segments failed:\n${failures.join('\n')}`);
  }
  if (failures.length > 0) {
    console.warn(`[video-gen] ${failures.length}/${campaign.segments.length} segments failed but continuing:\n${failures.join('\n')}`);
  }

  // Video gen is the last content stage. Copy + audiences are already done by now.
  if (campaign.autoLaunch) {
    // Fully automatic: dispatch META_SETUP before flipping status so it only
    // advances if dispatch succeeds.
    await dispatchStage(campaignId, 'META_SETUP');
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'LAUNCHING' },
    });
  } else {
    // Everything is prepared — the user can now pick copy (if they haven't) and launch.
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'READY' },
    });
  }
}

// ── Texture mode video ────────────────────────────────────────────────────────

const ASSETS_DIR = path.join(__dirname, '../../assets');

function generateTextureVideo(opts: {
  texturePath: string;
  coverArtPath: string;
  audio: string;
  output: string;
  ctaText: string;
  genre?: string;
  artistName?: string;
  showAlbumArt: boolean;
  visualConfig: VisualConfig | null;
  presetIndex: number;
}): Promise<void> {
  const { texturePath, coverArtPath, audio, output, ctaText, genre, artistName, showAlbumArt, visualConfig, presetIndex } = opts;
  const vc = visualConfig ?? {};
  const preset = PRESETS[presetIndex % PRESETS.length];

  const hookText = vc.hookText?.trim()
    || (genre ? `Do you like ${genre}?` : artistName ? `Do you like ${artistName}?` : null);

  const hookFontSize = hookText ? dynamicFontSize(hookText, 76) : 76;
  const ctaFontSize = dynamicFontSize(ctaText, 54);
  const ctaStyle = vc.cta ?? {};
  const ctaColor = toFFColor(ctaStyle.fontColor ?? '#FFFFFF');

  const THUMB = 390;
  const THUMB_X = Math.round((W - THUMB) / 2);
  const THUMB_Y = 325;
  const HOOK_Y = 145;
  const CTA_Y = THUMB_Y + THUMB + 55;

  const bgFilter = `[0:v]scale=1512:1512:force_original_aspect_ratio=increase,crop=1512:1512,zoompan=z='min(1+0.00012*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1800:s=${W}x${H}:fps=30[bg]`;

  if (showAlbumArt) {
    // Layout: bg + dark bands + thumbnail + hook + CTA (3 inputs)
    const filters = [
      bgFilter,
      `[bg]drawbox=x=0:y=0:w=${W}:h=${THUMB_Y - 30}:color=black@0.55:t=fill[c0]`,
      `[c0]drawbox=x=0:y=${THUMB_Y + THUMB + 30}:w=${W}:h=${H}:color=black@0.55:t=fill[c1]`,
      `[1:v]scale=${THUMB}:${THUMB}:force_original_aspect_ratio=decrease,pad=${THUMB}:${THUMB}:(ow-iw)/2:(oh-ih)/2:black[art]`,
      `[c1][art]overlay=${THUMB_X}:${THUMB_Y}[c2]`,
    ];
    if (hookText) {
      filters.push(`[c2]drawtext=fontfile='${esc(preset.hookFont)}':text='${esc(hookText)}':fontsize=${hookFontSize}:fontcolor=0xFFFFFF@1.0:x=(w-text_w)/2:y=${HOOK_Y}:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=true:${preset.hookAlpha}[c3]`);
    } else {
      filters.push(`[c2]copy[c3]`);
    }
    filters.push(`[c3]drawtext=fontfile='${esc(preset.ctaFont)}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=(w-text_w)/2:y=${CTA_Y}:shadowcolor=black@0.9:shadowx=2:shadowy=2:fix_bounds=true:${preset.ctaAlpha}[vout]`);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(texturePath).inputOptions(['-loop', '1', '-framerate', '30'])
        .input(coverArtPath).inputOptions(['-loop', '1', '-framerate', '30'])
        .input(audio)
        .outputOptions(['-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '2:a',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-c:a', 'aac', '-b:a', '192k',
          '-t', '30', '-shortest', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart'])
        .output(output)
        .on('start' as any, (cmd: string) => console.log(`[ffmpeg] ${cmd.slice(0, 300)}`))
        .on('error', ((err: Error, _stdout: string, stderr: string) => {
          const lastStderr = (stderr || '').trim().split('\n').slice(-10).join('\n');
          reject(new Error(`${err.message}\nstderr:\n${lastStderr}`));
        }) as any)
        .on('end', () => resolve())
        .run();
    });
  } else {
    // No art — bg + dark overlay top+bottom + hook + artist name center + CTA (2 inputs)
    const artistFontSize = dynamicFontSize(artistName ?? 'Artist', 92);
    const CENTER_Y = Math.round(H / 2 - artistFontSize / 2);
    const HOOK_Y2 = 155;
    const CTA_Y2 = H - 190;

    const filters = [
      bgFilter,
      `[bg]drawbox=x=0:y=0:w=${W}:h=220:color=black@0.50:t=fill[c0]`,
      `[c0]drawbox=x=0:y=${H - 220}:w=${W}:h=220:color=black@0.50:t=fill[c1]`,
    ];
    if (hookText) {
      filters.push(`[c1]drawtext=fontfile='${esc(preset.hookFont)}':text='${esc(hookText)}':fontsize=${hookFontSize}:fontcolor=0xFFFFFF@1.0:x=(w-text_w)/2:y=${HOOK_Y2}:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=true:${preset.hookAlpha}[c2]`);
    } else {
      filters.push(`[c1]copy[c2]`);
    }
    if (artistName) {
      filters.push(`[c2]drawtext=fontfile='${esc(preset.hookFont)}':text='${esc(artistName)}':fontsize=${artistFontSize}:fontcolor=0xFFFFFF@0.95:x=(w-text_w)/2:y=${CENTER_Y}:shadowcolor=black@0.9:shadowx=4:shadowy=4:fix_bounds=true[c3]`);
    } else {
      filters.push(`[c2]copy[c3]`);
    }
    filters.push(`[c3]drawtext=fontfile='${esc(preset.ctaFont)}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=(w-text_w)/2:y=${CTA_Y2}:shadowcolor=black@0.9:shadowx=2:shadowy=2:fix_bounds=true:${preset.ctaAlpha}[vout]`);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(texturePath).inputOptions(['-loop', '1', '-framerate', '30'])
        .input(audio)
        .outputOptions(['-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '1:a',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-c:a', 'aac', '-b:a', '192k',
          '-t', '30', '-shortest', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart'])
        .output(output)
        .on('start' as any, (cmd: string) => console.log(`[ffmpeg] ${cmd.slice(0, 300)}`))
        .on('error', ((err: Error, _stdout: string, stderr: string) => {
          const lastStderr = (stderr || '').trim().split('\n').slice(-10).join('\n');
          reject(new Error(`${err.message}\nstderr:\n${lastStderr}`));
        }) as any)
        .on('end', () => resolve())
        .run();
    });
  }
}

export function generateVideo(opts: {
  bgSrc: string;
  coverArtPath: string;
  audio: string;
  output: string;
  ctaText: string;
  genre?: string;
  artistName?: string;
  visualConfig: VisualConfig | null;
  presetIndex: number;
  aiBgPath?: string;
  lyrics?: { text: string; start: number; end: number }[];
}): Promise<void> {
  const { bgSrc, audio, output, ctaText, genre, artistName, visualConfig, aiBgPath, lyrics } = opts;
  const vc = visualConfig ?? {};
  const useAiBg = !!aiBgPath;
  const useLyrics = !!(lyrics && lyrics.length > 0);

  const ACCENT = '0x1DB954'; // Spotify green
  const hookText = vc.hookText?.trim()
    || (genre ? `Do you like ${genre}?` : artistName ? `Do you like ${artistName}?` : 'Wanna hear something great?');

  // 9:16 vertical template (1080×1920). AI visual is the hero — no album-art card,
  // just a bold hook and CTA over it, kept in the safe middle band away from
  // Reels/Stories UI. Text sits in a padded caption box with a smooth fade-in.
  const HOOK_Y = 780;
  const HOOK_SIZE = 76;
  const CTA_Y = 1560;
  const CTA_SIZE = 74;
  const FADE = `alpha='if(lt(t,0.6),t/0.6,1)'`; // smooth text fade-in
  const hookUpper = esc(hookText.toUpperCase());
  const ctaUpper = esc(ctaText.toUpperCase());

  // Background chain: an AI-generated 9:16 video loop (paid upsell) fills the frame
  // and keeps its own motion (no Ken Burns); the default square cover-art gets
  // scaled to a 9:16 frame, blurred, and slowly zoomed. Both feed [bg].
  const bgChain = useAiBg
    ? [`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=brightness=-0.12:saturation=1.15,setsar=1[bg]`]
    : [
        `[0:v]scale=1512:2688:force_original_aspect_ratio=increase,crop=1512:2688,boxblur=28:2,eq=brightness=-0.24:saturation=1.2[bgb]`,
        `[bgb]zoompan=z='min(1+0.00018*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1800:s=${W}x${H}:fps=30[bg]`,
      ];

  // Text chain ends at [txt]. Lyric mode: each timed line pops in centered during
  // its window (karaoke-style). Otherwise the static hook.
  const LYRIC_SIZE = 66;
  const textChain: string[] = [];
  if (useLyrics) {
    lyrics!.forEach((l, i) => {
      const prev = i === 0 ? '[bgsc]' : `[ly${i - 1}]`;
      const out = i === lyrics!.length - 1 ? '[txt]' : `[ly${i}]`;
      // Commas inside between() must be escaped in a filtergraph.
      const enable = `enable='between(t\\,${l.start.toFixed(2)}\\,${l.end.toFixed(2)})'`;
      textChain.push(
        `${prev}drawtext=fontfile='${FONTS.bebas}':text='${esc(l.text.toUpperCase())}':fontsize=${LYRIC_SIZE}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.42:boxborderw=26:${enable}${out}`,
      );
    });
  } else {
    textChain.push(
      `[bgsc]drawtext=fontfile='${FONTS.bebas}':text='${hookUpper}':fontsize=${HOOK_SIZE}:fontcolor=white:x=(w-text_w)/2:y=${HOOK_Y}:box=1:boxcolor=black@0.4:boxborderw=28:${FADE}[txt]`,
    );
  }

  const fc = [
    ...bgChain,
    // Light top + bottom darken for legibility without hiding the visual.
    `[bg]drawbox=x=0:y=0:w=${W}:h=220:color=black@0.22:t=fill,drawbox=x=0:y=${H - 380}:w=${W}:h=380:color=black@0.30:t=fill[bgsc]`,
    ...textChain,
    `[txt]drawtext=fontfile='${FONTS.bebas}':text='${ctaUpper}':fontsize=${CTA_SIZE}:fontcolor=${ACCENT}:x=(w-text_w)/2:y=${CTA_Y}:box=1:boxcolor=black@0.55:boxborderw=28:${FADE}[vout]`,
  ].join(';');

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    // Input 0 = background. AI video loops itself; a still image is looped as frames.
    if (useAiBg) {
      cmd.input(aiBgPath as string).inputOptions(['-stream_loop', '-1']);
    } else {
      cmd.input(bgSrc).inputOptions(['-loop', '1', '-framerate', '30']);
    }
    cmd
      .input(audio) // input 1 (no cover-art input — the AI/blurred visual is the hero)
      .outputOptions([
        '-filter_complex', fc,
        '-map', '[vout]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '19',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-t', '30',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-movflags', '+faststart',
      ])
      .output(output)
      .on('start' as any, (cmd: string) => console.log(`[ffmpeg] ${cmd.slice(0, 300)}`))
      .on('error', ((err: Error, _stdout: string, stderr: string) => {
        const lastStderr = (stderr || '').trim().split('\n').slice(-10).join('\n');
        reject(new Error(`${err.message}\nstderr:\n${lastStderr}`));
      }) as any)
      .on('end', () => resolve())
      .run();
  });
}
