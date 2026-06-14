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

const FONT_SIZE_MAP: Record<string, number> = { sm: 52, md: 68, lg: 88 };

function fontSizePt(size: string | undefined, bold?: boolean): number {
  const base = FONT_SIZE_MAP[size ?? 'md'] ?? 68;
  return bold ? base + 4 : base;
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

// Separate Y functions so heading and subheading don't overlap when sharing the same vAlign
function headingYExpr(vAlign: string | undefined): string {
  switch (vAlign) {
    case 'top':    return 'h*0.06';
    case 'bottom': return 'h*0.64';
    default:       return '(h/2)-text_h-8';
  }
}

function subheadingYExpr(vAlign: string | undefined): string {
  switch (vAlign) {
    case 'top':    return 'h*0.18';
    case 'bottom': return 'h*0.77';
    default:       return 'h/2+8';
  }
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

  for (const segment of campaign.segments) {
    const vc = visualConfig ?? {};
    const ctaText =
      visualConfig?.ctaText || CTA_OPTIONS[segment.index % CTA_OPTIONS.length];
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

  const headingFontSize = fontSizePt(heading.fontSize ?? 'lg', heading.fontBold ?? true);
  const subFontSize     = fontSizePt(subheading.fontSize ?? 'md', subheading.fontBold);
  const ctaFontSize     = fontSizePt(cta.fontSize ?? 'sm', cta.fontBold ?? true);

  const headingColor = toFFmpegColor(heading.fontColor);
  const subColor     = toFFmpegColor(subheading.fontColor, '0.9');
  const ctaColor     = toFFmpegColor(cta.fontColor ?? '#FFD700');

  const drawText = [
    `drawtext=text='${esc(songTitle)}':fontsize=${headingFontSize}:fontcolor=${headingColor}:x=${xExpr(heading.hAlign)}:y=${headingYExpr(heading.vAlign)}:shadowcolor=black:shadowx=3:shadowy=3:fix_bounds=true`,
    `drawtext=text='${esc(artistName)}':fontsize=${subFontSize}:fontcolor=${subColor}:x=${xExpr(subheading.hAlign)}:y=${subheadingYExpr(subheading.vAlign)}:shadowcolor=black:shadowx=2:shadowy=2:fix_bounds=true`,
    `drawtext=text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=${xExpr(cta.hAlign)}:y=h*0.91:shadowcolor=black:shadowx=2:shadowy=2:fix_bounds=true`,
  ].join(',');

  const blurAmount = vc.blurAmount ?? 0;
  const videoFilters: string[] = [
    'scale=1080:1080:force_original_aspect_ratio=decrease',
    'pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black',
  ];
  if (blurAmount > 0) {
    videoFilters.push(`boxblur=${blurAmount}:1`);
  }
  videoFilters.push(drawText);

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
    .replace(/'/g, '’')  // smart quote avoids escape issues
    .replace(/\\/g, '/')       // replace backslash with forward slash
    .replace(/:/g, ' -')       // replace colon with dash (safe in filenames/titles)
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}
