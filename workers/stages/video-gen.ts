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
  artMode?: 'art' | 'texture';
  backgroundTexture?: string;
}

const W = 1080;
const H = 1080;
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
      `;[bg_wide]crop=${W}:${H}:'min((1440-1080)*min(t/28,1),360)':0[bg]`,
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

function esc(text: string): string {
  return text
    .replace(/'/g, '’')
    .replace(/\\/g, '/')
    .replace(/:/g, ' -')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}

// ── Main worker ───────────────────────────────────────────────────────────────

export async function runVideoGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { segments: { orderBy: { index: 'asc' } } },
  });

  await prisma.videoCreative.deleteMany({ where: { campaignId } });

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const videoDir = path.join(uploadDir, campaignId, 'videos');
  fs.mkdirSync(videoDir, { recursive: true });

  const visualConfig: VisualConfig | null =
    campaign.visualConfig ? (campaign.visualConfig as VisualConfig) : null;

  const bgPath = visualConfig?.backgroundPath as string | undefined;
  const coverArtPath = campaign.coverArtUrl;

  for (const segment of campaign.segments) {
    const vc = visualConfig ?? {};
    const ctaText = visualConfig?.ctaText || CTA_OPTIONS[segment.index % CTA_OPTIONS.length];
    const outputFile = path.join(videoDir, `creative_${segment.index}.mp4`);
    const bgSrc = (vc.bgMode === 'upload' && bgPath) ? bgPath : coverArtPath;

    await generateVideo({
      bgSrc,
      coverArtPath,
      audio: segment.fileUrl,
      output: outputFile,
      ctaText,
      genre: (campaign as any).genre as string | undefined,
      artistName: campaign.artistName ?? undefined,
      visualConfig,
      presetIndex: segment.index,
    });

    const thumbFile = outputFile.replace('.mp4', '_thumb.jpg');
    await new Promise<void>((resolve) => {
      ffmpeg(outputFile)
        .outputOptions(['-ss 00:00:01', '-vframes 1', '-q:v 3'])
        .output(thumbFile)
        .on('end', () => resolve())
        .on('error', () => resolve())
        .run();
    });

    await prisma.videoCreative.create({
      data: { campaignId, segmentId: segment.id, fileUrl: outputFile, ctaText },
    });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: campaign.autoLaunch ? 'BUILDING' : 'CONTENT_READY' },
  });
  if (campaign.autoLaunch) {
    await dispatchStage(campaignId, 'COPY_GEN');
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
  visualConfig: VisualConfig | null;
  presetIndex: number;
}): Promise<void> {
  const { texturePath, coverArtPath, audio, output, ctaText, genre, artistName, visualConfig, presetIndex } = opts;
  const vc = visualConfig ?? {};
  const preset = PRESETS[presetIndex % PRESETS.length];

  const hookText = genre ? `Do you like ${genre}?`
    : artistName ? `Do you like ${artistName}?`
    : ctaText;

  const hookFontSize = dynamicFontSize(hookText, 76);
  const ctaFontSize = dynamicFontSize(ctaText, 54);
  const ctaStyle = vc.cta ?? {};
  const ctaColor = toFFColor(ctaStyle.fontColor ?? '#FFFFFF');

  const THUMB = 390;
  const THUMB_X = Math.round((W - THUMB) / 2); // 345
  const THUMB_Y = 325;
  const HOOK_Y = 155;
  const CTA_Y = THUMB_Y + THUMB + 55;

  const fc = [
    // Texture background — subtle slow zoom
    `[0:v]scale=1512:1512:force_original_aspect_ratio=increase,crop=1512:1512,zoompan=z='min(1+0.00012*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1800:s=${W}x${H}:fps=30[bg]`,
    // Dark overlay bands at top and bottom to aid text legibility
    `[bg]drawbox=x=0:y=0:w=${W}:h=${THUMB_Y - 30}:color=black@0.55:t=fill[c0]`,
    `[c0]drawbox=x=0:y=${THUMB_Y + THUMB + 30}:w=${W}:h=${H}:color=black@0.55:t=fill[c1]`,
    // Cover art thumbnail centred
    `[1:v]scale=${THUMB}:${THUMB}:force_original_aspect_ratio=decrease,pad=${THUMB}:${THUMB}:(ow-iw)/2:(oh-ih)/2:black[art]`,
    `[c1][art]overlay=${THUMB_X}:${THUMB_Y}[c2]`,
    // Hook text
    `[c2]drawtext=fontfile='${esc(preset.hookFont)}':text='${esc(hookText)}':fontsize=${hookFontSize}:fontcolor=0xFFFFFF@1.0:x=(w-text_w)/2:y=${HOOK_Y}:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=true:${preset.hookAlpha}[c3]`,
    // CTA text
    `[c3]drawtext=fontfile='${esc(preset.ctaFont)}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=(w-text_w)/2:y=${CTA_Y}:shadowcolor=black@0.9:shadowx=2:shadowy=2:fix_bounds=true:${preset.ctaAlpha}[vout]`,
  ].join(';');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(texturePath).inputOptions(['-stream_loop', '-1'])
      .input(coverArtPath).inputOptions(['-stream_loop', '-1'])
      .input(audio)
      .outputOptions([
        '-filter_complex', fc,
        '-map', '[vout]',
        '-map', '2:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function generateVideo(opts: {
  bgSrc: string;
  coverArtPath: string;
  audio: string;
  output: string;
  ctaText: string;
  genre?: string;
  artistName?: string;
  visualConfig: VisualConfig | null;
  presetIndex: number;
}): Promise<void> {
  const { bgSrc, coverArtPath, audio, output, ctaText, genre, artistName, visualConfig, presetIndex } = opts;
  const vc = visualConfig ?? {};

  // Texture mode — use a solid gradient PNG as background
  if (vc.artMode === 'texture') {
    const textureId = vc.backgroundTexture ?? 'midnight';
    const texturePath = path.join(ASSETS_DIR, 'textures', `${textureId}.png`);
    const fallback = path.join(ASSETS_DIR, 'textures', 'midnight.png');
    return generateTextureVideo({
      texturePath: fs.existsSync(texturePath) ? texturePath : fallback,
      coverArtPath, audio, output, ctaText, genre, artistName, visualConfig, presetIndex,
    });
  }

  const blur = vc.blurAmount ?? 18;

  const preset = PRESETS[presetIndex % PRESETS.length];

  // Hook: genre → artist name → null (no duplicate of CTA)
  const hookText = genre ? `Do you like ${genre}?`
    : artistName ? `Do you like ${artistName}?`
    : null;
  const hookFontSize = hookText ? dynamicFontSize(hookText, 72) : 72;
  const hookY = ART_Y + TEXT_PAD;

  const ctaStyle = vc.cta ?? {};
  const ctaFontSize = dynamicFontSize(ctaText, 52);
  const ctaColor = toFFColor(ctaStyle.fontColor ?? '#FFFFFF');
  const ctaY = ART_BOTTOM - TEXT_PAD - ctaFontSize;

  const hookYExpr = preset.hookYExpr(hookY);
  const ctaYExpr  = preset.ctaYExpr(ctaY);

  // Background animation filter — defined by preset
  const bgSection = preset.bgFilter(blur);

  // All presets output [bg] as the final node
  const needsBgInput = !bgSection.includes('[bg]') ? `${bgSection}[bg]` : bgSection;

  const overlayAndTextFilters = [
    // Cover art — large, centred
    `[1:v]scale=${ART_SIZE}:${ART_SIZE}:force_original_aspect_ratio=decrease,pad=${ART_SIZE}:${ART_SIZE}:(ow-iw)/2:(oh-ih)/2:black[art]`,
    `[bg][art]overlay=${ART_X}:${ART_Y}[c0]`,
    // Gradient-style dark overlay
    `[c0]drawbox=x=${ART_X}:y=${ART_Y}:w=${ART_SIZE}:h=160:color=black@0.65:t=fill[c1]`,
    `[c1]drawbox=x=${ART_X}:y=${ART_BOTTOM - 160}:w=${ART_SIZE}:h=160:color=black@0.65:t=fill[c2]`,
    `[c2]drawbox=x=${ART_X}:y=${ART_Y + 160}:w=${ART_SIZE}:h=${ART_SIZE - 320}:color=black@0.30:t=fill[c3]`,
  ];

  // Hook text (only when we have a non-duplicate line)
  if (hookText) {
    overlayAndTextFilters.push(
      `[c3]drawtext=fontfile='${esc(preset.hookFont)}':text='${esc(hookText)}':fontsize=${hookFontSize}:fontcolor=0xFFFFFF@1.0:x=(w-text_w)/2:y='${hookYExpr}':shadowcolor=black@0.85:shadowx=3:shadowy=3:fix_bounds=true:${preset.hookAlpha}[c4]`,
    );
  } else {
    overlayAndTextFilters.push(`[c3]copy[c4]`);
  }

  // CTA text
  overlayAndTextFilters.push(
    `[c4]drawtext=fontfile='${esc(preset.ctaFont)}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=(w-text_w)/2:y='${ctaYExpr}':shadowcolor=black@0.85:shadowx=2:shadowy=2:fix_bounds=true:${preset.ctaAlpha}[vout]`,
  );

  const fc = [needsBgInput, ...overlayAndTextFilters].join(';');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(bgSrc).inputOptions(['-stream_loop', '-1'])
      .input(coverArtPath).inputOptions(['-stream_loop', '-1'])
      .input(audio)
      .outputOptions([
        '-filter_complex', fc,
        '-map', '[vout]',
        '-map', '2:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}
