import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { dispatchStage } from '../../lib/queue';

const prisma = new PrismaClient();

const SEGMENT_DURATION = 30;
const NUM_SEGMENTS = 5;

export async function runSegmentation(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const segmentDir = path.join(uploadDir, campaignId, 'segments');
  fs.mkdirSync(segmentDir, { recursive: true });

  const duration = await getAudioDuration(campaign.audioUrl);

  const step = duration / NUM_SEGMENTS;
  const segments: { start: number; end: number; index: number }[] = [];
  for (let i = 0; i < NUM_SEGMENTS; i++) {
    const start = i * step;
    const end = Math.min(start + SEGMENT_DURATION, duration);
    segments.push({ start, end, index: i });
  }

  for (const seg of segments) {
    const outputFile = path.join(segmentDir, `segment_${seg.index}.mp3`);
    await cutSegment(campaign.audioUrl, outputFile, seg.start, seg.end - seg.start);

    await prisma.audioSegment.create({
      data: {
        campaignId,
        fileUrl: outputFile,
        startSec: seg.start,
        endSec: seg.end,
        index: seg.index,
      },
    });
  }

  await dispatchStage(campaignId, 'VIDEO_GEN');
}

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

function cutSegment(input: string, output: string, start: number, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(start)
      .setDuration(duration)
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}
