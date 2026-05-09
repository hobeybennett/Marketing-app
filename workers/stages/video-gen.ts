import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { dispatchStage } from '../../lib/queue';

const prisma = new PrismaClient();

const CTA_OPTIONS = ['Listen Now', 'Stream Today', 'Hear It First', 'Play Now', 'Out Now'];

export async function runVideoGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { segments: { orderBy: { index: 'asc' } } },
  });

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const videoDir = path.join(uploadDir, campaignId, 'videos');
  fs.mkdirSync(videoDir, { recursive: true });

  for (const segment of campaign.segments) {
    const ctaText = CTA_OPTIONS[segment.index % CTA_OPTIONS.length];
    const outputFile = path.join(videoDir, `creative_${segment.index}.mp4`);

    await generateVideo({
      coverArt: campaign.coverArtUrl,
      audio: segment.fileUrl,
      output: outputFile,
      ctaText,
      artistName: campaign.artistName,
      songTitle: campaign.songTitle,
    });

    await prisma.videoCreative.create({
      data: { campaignId, segmentId: segment.id, fileUrl: outputFile, ctaText },
    });
  }

  await dispatchStage(campaignId, 'COPY_GEN');
}

function generateVideo(opts: {
  coverArt: string;
  audio: string;
  output: string;
  ctaText: string;
  artistName: string;
  songTitle: string;
}): Promise<void> {
  const { coverArt, audio, output, ctaText, artistName, songTitle } = opts;

  const drawText = [
    `drawtext=text='${esc(songTitle)}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h*0.75:shadowcolor=black:shadowx=2:shadowy=2`,
    `drawtext=text='${esc(artistName)}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=h*0.83:shadowcolor=black:shadowx=2:shadowy=2`,
    `drawtext=text='${esc(ctaText)}':fontsize=42:fontcolor=yellow:x=(w-text_w)/2:y=h*0.91:shadowcolor=black:shadowx=2:shadowy=2`,
  ].join(',');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(coverArt)
      .loop()
      .input(audio)
      .videoFilters([
        'scale=1080:1080:force_original_aspect_ratio=decrease',
        'pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black',
        drawText,
      ])
      .outputOptions(['-c:v libx264', '-c:a aac', '-shortest', '-pix_fmt yuv420p', '-r 30'])
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}
