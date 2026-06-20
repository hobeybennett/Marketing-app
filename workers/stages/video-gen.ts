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
// Max text width within the art card (860px wide, 80px padding each side)
const MAX_TEXT_W = 700;

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

// Layout: large cover art centered on blurred bg, text overlaid on art
const ART_SIZE = 860;
const ART_X = Math.round((W - ART_SIZE) / 2); // 110
const ART_Y = 110;
const ART_BOTTOM = ART_Y + ART_SIZE; // 970
const TEXT_PAD = 72; // px from art edge to text baseline

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
  const { bgSrc, coverArtPath, audio, output, ctaText, genre, visualConfig } = opts;

  const vc = visualConfig ?? {};
  const bgBlur = vc.blurAmount ?? 18;

  // Hook: genre question when available, CTA text otherwise (never the song title)
  const hookText = genre ? `Do you like ${genre}?` : ctaText;
  const hookFontSize = dynamicFontSize(hookText, BASE_SIZES['lg']);
  const hookY = ART_Y + TEXT_PAD;

  const ctaStyle = vc.cta ?? {};
  const ctaFontSize = dynamicFontSize(ctaText, Math.round(BASE_SIZES[ctaStyle.fontSize ?? 'md'] * 0.88));
  const ctaFont = resolveFont({ ...ctaStyle, fontBold: ctaStyle.fontBold ?? true });
  const ctaColor = toFFColor(ctaStyle.fontColor ?? '#FFFFFF');
  const ctaY = ART_BOTTOM - TEXT_PAD - ctaFontSize;

  // Fade-in: hook appears at t=0, CTA fades in after 0.4s
  const hookAlpha = `alpha='if(lt(t,0.5),t/0.5,1)'`;
  const ctaAlpha  = `alpha='if(lt(t,0.4),0,if(lt(t,0.8),(t-0.4)/0.4,1))'`;

  const fc = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${bgBlur > 0 ? `,boxblur=${bgBlur}:1` : ''}[bg]`,
    `[1:v]scale=${ART_SIZE}:${ART_SIZE}:force_original_aspect_ratio=decrease,pad=${ART_SIZE}:${ART_SIZE}:(ow-iw)/2:(oh-ih)/2:black[art]`,
    `[bg][art]overlay=${ART_X}:${ART_Y}[c0]`,
    // Unified dark overlay on the entire art card for text legibility
    `[c0]drawbox=x=${ART_X}:y=${ART_Y}:w=${ART_SIZE}:h=${ART_SIZE}:color=black@0.52:t=fill[c1]`,
    // Hook text — fades in from start
    `[c1]drawtext=fontfile='${FONT_HEADING}':text='${esc(hookText)}':fontsize=${hookFontSize}:fontcolor=0xFFFFFF@1.0:x=(w-text_w)/2:y=${hookY}:shadowcolor=black@0.9:shadowx=3:shadowy=3:fix_bounds=true:${hookAlpha}[c2]`,
    // CTA text — fades in with short delay
    `[c2]drawtext=fontfile='${ctaFont}':text='${esc(ctaText)}':fontsize=${ctaFontSize}:fontcolor=${ctaColor}:x=(w-text_w)/2:y=${ctaY}:shadowcolor=black@0.9:shadowx=2:shadowy=2:fix_bounds=true:${ctaAlpha}[vout]`,
  ].join(';');

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
