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

const FONT_SIZE_MAP: Record<string, number> = { sm: 13, md: 18, lg: 26 };

function fontSizePt(size: string | undefined, bold?: boolean): number {
  const base = FONT_SIZE_MAP[size ?? 'md'] ?? 18;
  // rough bold approximation: bump by 1pt
  return bold ? base + 1 : base;
}

function toFFmpegColor(hex: string | undefined): string {
  if (!hex) return '0xFFFFFF@1.0';
  const stripped = hex.replace('#', '');
  return `0x${stripped.toUpperCase()}@1.0`;
}

function xExpr(hAlign: string | undefined): string {
  switch (hAlign) {
    case 'left':  return 'w*0.05';
    case 'right': return 'w-text_w-w*0.05';
    default:      return '(w-text_w)/2';
  }
}

function yExpr(vAlign: string | undefined): string {
  switch (vAlign) {
    case 'top':    return 'h*0.1';
    case 'bottom': return 'h*0.75';
    default:       return '(h-text_h)/2';
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

  const headingFontSize = fontSizePt(heading.fontSize, heading.fontBold);
  const subFontSize     = fontSizePt(subheading.fontSize, subheading.fontBold);
  const headingColor    = toFFmpegColor(heading.fontColor);
  const subColor        = toFFmpegColor(subheading.fontColor);

  const drawText = [
    `drawtext=text='${esc(songTitle)}':fontsize=${headingFontSize}:fontcolor=${headingColor}:x=${xExpr(heading.hAlign)}:y=${yExpr(heading.vAlign)}:shadowcolor=black:shadowx=2:shadowy=2`,
    `drawtext=text='${esc(artistName)}':fontsize=${subFontSize}:fontcolor=${subColor}:x=${xExpr(subheading.hAlign)}:y=${yExpr(subheading.vAlign)}:shadowcolor=black:shadowx=2:shadowy=2`,
    `drawtext=text='${esc(ctaText)}':fontsize=42:fontcolor=yellow:x=(w-text_w)/2:y=h*0.91:shadowcolor=black:shadowx=2:shadowy=2`,
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
