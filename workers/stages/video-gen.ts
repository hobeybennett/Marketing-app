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
}

// Base font sizes in pixels for a 1080×1080 video.
// These are the sizes used for short text; dynamicFontSize() reduces them for long strings.
const FONT_SIZE_MAP: Record<string, number> = { sm: 46, md: 62, lg: 82 };

// Safe drawable width (1080 minus 70px per side of padding)
const MAX_TEXT_WIDTH = 940;

// Reduce font size so text fits within MAX_TEXT_WIDTH.
// Uses a conservative character-width ratio for Liberation Sans (0.58 covers bold too).
function dynamicFontSize(text: string, base: number, min = 32): number {
  const estimated = text.length * base * 0.58;
  if (estimated <= MAX_TEXT_WIDTH) return base;
  return Math.max(Math.floor(MAX_TEXT_WIDTH / (text.length * 0.58)), min);
}

// Font files available on Railway's Nix environment (ffmpeg nixPkg installs these).
const FONT_FILES: Record<string, { regular: string; bold: string }> = {
  sans: {
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    bold:    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  },
  serif: {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    bold:    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
  },
  display: {
    // No Impact on Nix — use Liberation Sans Bold as closest heavy sans
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    bold:    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  },
  mono: {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    bold:    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
  },
  narrow: {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold:    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  },
};

function resolveFont(fontFamily: string | undefined, bold: boolean | undefined): string {
  const family = (fontFamily && FONT_FILES[fontFamily]) ? fontFamily : 'sans';
  const fonts = FONT_FILES[family];
  return bold ? fonts.bold : fonts.regular;
}

function fontSize(size: string | undefined): number {
  return FONT_SIZE_MAP[size ?? 'md'] ?? 62;
}

function toFFmpegColor(hex: string | undefined, alpha = '1.0'): string {
  if (!hex) return `0xFFFFFF@${alpha}`;
  const stripped = hex.replace('#', '');
  return `0x${stripped.toUpperCase()}@${alpha}`;
}

function xExpr(hAlign: string | undefined): string {
  switch (hAlign) {
    case 'left':  return 'w*0.06';
    case 'right': return 'w-text_w-w*0.06';
    default:      return '(w-text_w)/2';
  }
}

// ── Grouped Y-position computation ─────────────────────────────────────────
// The preview groups text layers that share the same vAlign and stacks them.
// We replicate that here using absolute pixel positions (video is always 1080×1080).

const VIDEO_SIZE = 1080;
const EDGE_PAD   = 38;   // pixels from top/bottom edge
const ITEM_GAP   = 10;   // gap between stacked items in the same group

function computeYPositions(
  heading: ElementStyle,
  subheading: ElementStyle,
  cta: ElementStyle,
  headFontSize: number,
  subFontSize: number,
  ctaFontSize: number,
): { headingY: number; subheadingY: number; ctaY: number } {
  // Approximate rendered text height (FFmpeg's drawtext renders slightly below fontsize)
  const headH = Math.round(headFontSize * 1.1);
  const subH  = Math.round(subFontSize  * 1.1);
  const ctaH  = Math.round(ctaFontSize  * 1.1);

  const elements = [
    { key: 'heading'    as const, vAlign: heading.vAlign    ?? 'bottom', height: headH },
    { key: 'subheading' as const, vAlign: subheading.vAlign ?? 'bottom', height: subH  },
    { key: 'cta'        as const, vAlign: cta.vAlign        ?? 'bottom', height: ctaH  },
  ];

  const groups: Record<string, typeof elements> = { top: [], center: [], bottom: [] };
  for (const el of elements) {
    (groups[el.vAlign] ?? groups.bottom).push(el);
  }

  const yMap: Record<string, number> = {};

  for (const [align, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    const totalH = items.reduce((s, it, i) => s + it.height + (i > 0 ? ITEM_GAP : 0), 0);
    let startY: number;
    if (align === 'top')         startY = EDGE_PAD;
    else if (align === 'center') startY = Math.round((VIDEO_SIZE - totalH) / 2);
    else                         startY = VIDEO_SIZE - EDGE_PAD - totalH;

    let y = startY;
    for (const item of items) {
      yMap[item.key] = y;
      y += item.height + ITEM_GAP;
    }
  }

  return {
    headingY:    yMap.heading    ?? Math.round(VIDEO_SIZE * 0.4),
    subheadingY: yMap.subheading ?? Math.round(VIDEO_SIZE * 0.55),
    ctaY:        yMap.cta        ?? Math.round(VIDEO_SIZE * 0.75),
  };
}

// ── Gradient overlay (approximates preview CSS) ─────────────────────────────
// Preview: linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 28%,
//                                     transparent 68%, rgba(0,0,0,0.55) 100%)
// We approximate with banded drawbox calls (no native gradient in drawtext pipeline).

const GRADIENT_FILTERS = [
  // Top fade: 0% → 28%  (rgba 0.18 → 0)
  'drawbox=x=0:y=0:w=iw:h=ih*0.14:color=black@0.12:t=fill',
  'drawbox=x=0:y=0:w=iw:h=ih*0.07:color=black@0.06:t=fill',
  // Bottom fade: 68% → 100%  (rgba 0 → 0.55)
  'drawbox=x=0:y=ih*0.68:w=iw:h=ih*0.08:color=black@0.10:t=fill',
  'drawbox=x=0:y=ih*0.76:w=iw:h=ih*0.08:color=black@0.18:t=fill',
  'drawbox=x=0:y=ih*0.84:w=iw:h=ih*0.08:color=black@0.28:t=fill',
  'drawbox=x=0:y=ih*0.92:w=iw:h=ih*0.08:color=black@0.40:t=fill',
];

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

  for (const segment of campaign.segments) {
    const vc = visualConfig ?? {};
    const ctaText = visualConfig?.ctaText || CTA_OPTIONS[0];
    const outputFile = path.join(videoDir, `creative_${segment.index}.mp4`);
    const bgSrc = (vc.bgMode === 'upload' && bgPath) ? bgPath : campaign.coverArtUrl;

    await generateVideo({
      bgSrc,
      audio: segment.fileUrl,
      output: outputFile,
      ctaText,
      artistName: campaign.artistName,
      songTitle: campaign.songTitle,
      visualConfig,
    });

    // Extract first frame as a thumbnail for the browser <video poster> attribute
    const thumbFile = outputFile.replace('.mp4', '_thumb.jpg');
    await new Promise<void>((resolve, reject) => {
      ffmpeg(outputFile)
        .outputOptions(['-ss 00:00:01', '-vframes 1', '-q:v 3'])
        .output(thumbFile)
        .on('end', () => resolve())
        .on('error', () => resolve()) // non-fatal
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

function generateVideo(opts: {
  bgSrc: string;
  audio: string;
  output: string;
  ctaText: string;
  artistName: string;
  songTitle: string;
  visualConfig: VisualConfig | null;
}): Promise<void> {
  const { bgSrc, audio, output, ctaText, artistName, songTitle, visualConfig } = opts;

  const vc = visualConfig ?? {};
  const heading    = vc.heading    ?? {};
  const subheading = vc.subheading ?? {};
  const cta        = vc.cta        ?? {};

  const headFontSize = dynamicFontSize(songTitle,  fontSize(heading.fontSize    ?? 'lg'));
  const subFontSize  = dynamicFontSize(artistName, fontSize(subheading.fontSize ?? 'md'));
  const ctaFontSize  = dynamicFontSize(ctaText,    fontSize(cta.fontSize        ?? 'sm'));

  const headFont = resolveFont(heading.fontFamily,    heading.fontBold    ?? true);
  const subFont  = resolveFont(subheading.fontFamily, subheading.fontBold);
  const ctaFont  = resolveFont(cta.fontFamily,        cta.fontBold        ?? true);

  const headColor = toFFmpegColor(heading.fontColor);
  const subColor  = toFFmpegColor(subheading.fontColor, '0.9');
  const ctaColor  = toFFmpegColor(cta.fontColor ?? '#FFD700');

  const { headingY, subheadingY, ctaY } = computeYPositions(
    heading, subheading, cta,
    headFontSize, subFontSize, ctaFontSize,
  );

  const headX = xExpr(heading.hAlign);
  const subX  = xExpr(subheading.hAlign);
  const ctaX  = xExpr(cta.hAlign);

  const drawTextFilters = [
    `drawtext=fontfile='${headFont}':text='${esc(songTitle)}':fontsize=${headFontSize}:fontcolor=${headColor}:x=${headX}:y=${headingY}:shadowcolor=black@0.8:shadowx=3:shadowy=3:fix_bounds=true`,
    `drawtext=fontfile='${subFont}':text='${esc(artistName)}':fontsize=${subFontSize}:fontcolor=${subColor}:x=${subX}:y=${subheadingY}:shadowcolor=black@0.8:shadowx=2:shadowy=2:fix_bounds=true`,
    `drawtext=fontfile='${ctaFont}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=${ctaX}:y=${ctaY}:shadowcolor=black@0.9:shadowx=2:shadowy=2:fix_bounds=true`,
  ];

  const blurAmount = vc.blurAmount ?? 0;
  const videoFilters: string[] = [
    'scale=1080:1080:force_original_aspect_ratio=decrease',
    'pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black',
  ];
  if (blurAmount > 0) {
    videoFilters.push(`boxblur=${blurAmount}:1`);
  }
  // Gradient overlay — must come before drawtext so text renders on top
  videoFilters.push(...GRADIENT_FILTERS);
  videoFilters.push(...drawTextFilters);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(bgSrc)
      .loop()
      .input(audio)
      .videoFilters(videoFilters)
      .outputOptions(['-c:v libx264', '-c:a aac', '-shortest', '-pix_fmt yuv420p', '-r 30'])
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function esc(text: string): string {
  return text
    .replace(/'/g, '’')  // smart quote avoids ffmpeg escape issues
    .replace(/\\/g, '/')
    .replace(/:/g, ' -')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}
