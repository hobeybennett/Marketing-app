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

// Video dimensions
const W = 1080;
const H = 1080;

// Art overlay: fills most of the frame, positioned at top
const ART_SIZE = 760;
const ART_X_OFFSET = Math.round((W - ART_SIZE) / 2); // 160
const ART_Y = 52;
const ART_BOTTOM = ART_Y + ART_SIZE; // 812

// Text block sits below the art overlay
const TEXT_TOP = ART_BOTTOM + 22;

// Discover the best available font file for a role
function findFont(candidates: string[]): string {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1];
}

// Bundled fonts (checked into assets/fonts/ for consistent rendering)
const ASSETS_FONTS = path.join(__dirname, '../../assets/fonts');

const FONT_HEADING = findFont([
  path.join(ASSETS_FONTS, 'Montserrat-ExtraBold.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]);
const FONT_BODY = findFont([
  path.join(ASSETS_FONTS, 'Montserrat-Bold.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]);
const FONT_BODY_BOLD = findFont([
  path.join(ASSETS_FONTS, 'Montserrat-Bold.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]);

// Base font sizes for 1080×1080
const BASE_SIZES: Record<string, number> = { sm: 44, md: 58, lg: 78 };
const MAX_TEXT_W = 920;

function dynamicFontSize(text: string, base: number, min = 32): number {
  const est = text.length * base * 0.58;
  if (est <= MAX_TEXT_W) return base;
  return Math.max(Math.floor(MAX_TEXT_W / (text.length * 0.58)), min);
}

function toFFColor(hex: string | undefined, alpha = '1.0'): string {
  if (!hex) return `0xFFFFFF@${alpha}`;
  return `0x${hex.replace('#', '').toUpperCase()}@${alpha}`;
}

function resolveFont(style: ElementStyle): string {
  const fam = style.fontFamily;
  if (fam === 'serif')  return findFont(['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', FONT_HEADING]);
  if (fam === 'mono')   return findFont(['/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', FONT_HEADING]);
  return style.fontBold !== false ? FONT_HEADING : FONT_BODY;
}

function esc(text: string): string {
  return text
    .replace(/'/g, '’')
    .replace(/\\/g, '/')
    .replace(/:/g, ' -')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}

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
  const coverArtPath = campaign.coverArtUrl; // always local disk path

  for (const segment of campaign.segments) {
    const vc = visualConfig ?? {};
    const ctaText = visualConfig?.ctaText || CTA_OPTIONS[0];
    const outputFile = path.join(videoDir, `creative_${segment.index}.mp4`);
    const bgSrc = (vc.bgMode === 'upload' && bgPath) ? bgPath : coverArtPath;

    await generateVideo({
      bgSrc,
      coverArtPath,
      audio: segment.fileUrl,
      output: outputFile,
      ctaText,
      artistName: campaign.artistName,
      songTitle: campaign.songTitle,
      genre: (campaign as any).genre as string | undefined,
      visualConfig,
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

// Genre layout constants (used when campaign has a genre set)
const GENRE_ART_SIZE = 680;
const GENRE_ART_X = Math.round((W - GENRE_ART_SIZE) / 2); // 200
const GENRE_ART_Y = 180;
const GENRE_ART_BOTTOM = GENRE_ART_Y + GENRE_ART_SIZE; // 860
const GENRE_TOP_BAND_H = 170; // dark band for hook text
const GENRE_BOTTOM_BAND_Y = GENRE_ART_BOTTOM; // dark band for CTA

function generateVideo(opts: {
  bgSrc: string;
  coverArtPath: string;
  audio: string;
  output: string;
  ctaText: string;
  artistName: string;
  songTitle: string;
  genre?: string;
  visualConfig: VisualConfig | null;
}): Promise<void> {
  const { bgSrc, coverArtPath, audio, output, ctaText, artistName, songTitle, genre, visualConfig } = opts;

  const vc = visualConfig ?? {};
  const bgBlur = vc.blurAmount ?? 18;

  let fc: string;

  if (genre) {
    // Genre-hook layout: "Do you like [genre]?" at top, cover art in middle, CTA at bottom
    const hookText = `Do you like ${genre}?`;
    const hookFontSize = dynamicFontSize(hookText, BASE_SIZES['lg']);
    const hookY = Math.max(20, Math.round((GENRE_TOP_BAND_H - hookFontSize) / 2));

    const ctaStyle = vc.cta ?? {};
    const ctaFontSize = Math.round(BASE_SIZES[ctaStyle.fontSize ?? 'md'] * 0.88);
    const ctaFont = resolveFont({ ...ctaStyle, fontBold: ctaStyle.fontBold ?? true });
    const ctaColor = toFFColor(ctaStyle.fontColor ?? '#FFFFFF');
    const bottomBandH = H - GENRE_BOTTOM_BAND_Y;
    const ctaY = GENRE_BOTTOM_BAND_Y + Math.max(20, Math.round((bottomBandH - ctaFontSize) / 2));

    fc = [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${bgBlur > 0 ? `,boxblur=${bgBlur}:1` : ''}[bg]`,
      `[1:v]scale=${GENRE_ART_SIZE}:${GENRE_ART_SIZE}:force_original_aspect_ratio=decrease,pad=${GENRE_ART_SIZE}:${GENRE_ART_SIZE}:(ow-iw)/2:(oh-ih)/2:black[art]`,
      `[bg][art]overlay=${GENRE_ART_X}:${GENRE_ART_Y}[c0]`,
      `[c0]drawbox=x=0:y=0:w=iw:h=${GENRE_TOP_BAND_H}:color=black@0.75:t=fill[c1]`,
      `[c1]drawbox=x=0:y=${GENRE_BOTTOM_BAND_Y}:w=iw:h=${bottomBandH}:color=black@0.70:t=fill[c2]`,
      `[c2]drawtext=fontfile='${FONT_HEADING}':text='${esc(hookText)}':fontsize=${hookFontSize}:fontcolor=0xFFFFFF@1.0:x=(w-text_w)/2:y=${hookY}:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=true[c3]`,
      `[c3]drawtext=fontfile='${ctaFont}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=(w-text_w)/2:y=${ctaY}:shadowcolor=black@0.9:shadowx=2:shadowy=2:fix_bounds=true[vout]`,
    ].join(';');
  } else {
    // Original layout: title + artist + CTA stacked below the art overlay
    const headingStyle    = vc.heading    ?? {};
    const subheadingStyle = vc.subheading ?? {};
    const ctaStyle        = vc.cta        ?? {};

    const headFontSize = dynamicFontSize(songTitle,  BASE_SIZES[headingStyle.fontSize    ?? 'lg']);
    const subFontSize  = dynamicFontSize(artistName, BASE_SIZES[subheadingStyle.fontSize ?? 'md']);
    const ctaFontSize  = Math.round(BASE_SIZES[ctaStyle.fontSize ?? 'sm'] * 0.82);

    const headFont = resolveFont({ ...headingStyle,    fontBold: headingStyle.fontBold    ?? true  });
    const subFont  = resolveFont({ ...subheadingStyle, fontBold: subheadingStyle.fontBold ?? false });
    const ctaFont  = resolveFont({ ...ctaStyle,        fontBold: ctaStyle.fontBold        ?? true  });

    const headColor = toFFColor(headingStyle.fontColor    ?? '#FFFFFF');
    const subColor  = toFFColor(subheadingStyle.fontColor ?? '#E0E0E0', '0.92');
    const ctaColor  = toFFColor(ctaStyle.fontColor        ?? '#FFFFFF');

    const headY = TEXT_TOP;
    const subY  = headY + Math.round(headFontSize * 1.15) + 10;
    const ctaY  = subY  + Math.round(subFontSize  * 1.15) + 14;

    const vignetteStart = ART_BOTTOM - 10;

    fc = [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${bgBlur > 0 ? `,boxblur=${bgBlur}:1` : ''}[bg]`,
      `[1:v]scale=${ART_SIZE}:${ART_SIZE}:force_original_aspect_ratio=decrease,pad=${ART_SIZE}:${ART_SIZE}:(ow-iw)/2:(oh-ih)/2:black[art]`,
      `[bg][art]overlay=${ART_X_OFFSET}:${ART_Y}[c0]`,
      `[c0]drawbox=x=0:y=${vignetteStart}:w=iw:h=${H - vignetteStart}:color=black@0.55:t=fill[c1]`,
      `[c1]drawbox=x=0:y=${vignetteStart + 60}:w=iw:h=${H - vignetteStart - 60}:color=black@0.25:t=fill[c2]`,
      `[c2]drawtext=fontfile='${headFont}':text='${esc(songTitle)}':fontsize=${headFontSize}:fontcolor=${headColor}:x=(w-text_w)/2:y=${headY}:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=true[c3]`,
      `[c3]drawtext=fontfile='${subFont}':text='${esc(artistName)}':fontsize=${subFontSize}:fontcolor=${subColor}:x=(w-text_w)/2:y=${subY}:shadowcolor=black@0.8:shadowx=2:shadowy=2:fix_bounds=true[c4]`,
      `[c4]drawtext=fontfile='${ctaFont}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=(w-text_w)/2:y=${ctaY}:shadowcolor=black@0.9:shadowx=2:shadowy=2:fix_bounds=true[vout]`,
    ].join(';');
  }

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(bgSrc).loop()
      .input(coverArtPath).loop()
      .input(audio)
      .outputOptions([
        '-filter_complex', fc,
        '-map', '[vout]',
        '-map', '2:a',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
      ])
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}
