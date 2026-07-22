import { prisma } from '../prisma';
import * as fs from 'fs';
import * as path from 'path';
import { generateVideo, clipLyrics, type Lyric } from './video-gen';

// Owner tuning aid: render ONE sample creative using the first AI option (or the
// chosen one) WITHOUT touching campaign status or the real creatives. Output goes
// to videos/preview.mp4, viewable at /api/videos/{campaignId}/preview.mp4.
export async function runAiVideoPreview(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { segments: { orderBy: { index: 'asc' }, take: 1 } },
  });

  const c = campaign as any;
  const clipUrl: string | null =
    (c.aiVideoChoiceUrl as string | null) ??
    (Array.isArray(c.aiVideoOptions) ? (c.aiVideoOptions as string[])[0] : null);
  if (!clipUrl) throw new Error('No AI clip to preview — generate options first');

  const segment = campaign.segments[0];
  if (!segment) throw new Error('No audio segment to preview');

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const videoDir = path.join(uploadDir, campaignId, 'videos');
  fs.mkdirSync(videoDir, { recursive: true });

  const aiBgPath = path.join(uploadDir, campaignId, 'ai_bg_preview.mp4');
  const res = await fetch(clipUrl);
  if (!res.ok) throw new Error(`clip download failed: ${res.status}`);
  fs.writeFileSync(aiBgPath, Buffer.from(await res.arrayBuffer()));

  const visualConfig = campaign.visualConfig ? (campaign.visualConfig as any) : null;
  const ctaText = visualConfig?.ctaText || 'Listen Now';
  const allLyrics = Array.isArray(c.lyrics) ? (c.lyrics as Lyric[]) : null;

  await generateVideo({
    bgSrc: campaign.coverArtUrl,
    coverArtPath: campaign.coverArtUrl,
    audio: segment.fileUrl,
    output: path.join(videoDir, 'preview.mp4'),
    ctaText,
    genre: c.genre ?? undefined,
    artistName: campaign.artistName ?? undefined,
    visualConfig,
    presetIndex: 0,
    aiBgPath,
    lyrics: clipLyrics(allLyrics, segment.startSec, segment.endSec),
  });

  console.log(`[ai-video-preview] rendered preview for ${campaignId}`);
}
