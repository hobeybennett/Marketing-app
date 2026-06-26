import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

const SEGMENT_DURATION = 30;
const NUM_SEGMENTS = 5;

export async function runSegmentation(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  await prisma.audioSegment.deleteMany({ where: { campaignId } });

  // Derive segment dir from the audio file path so it always co-locates with
  // the source file, regardless of UPLOAD_DIR differences between services.
  const segmentDir = path.join(path.dirname(campaign.audioUrl), 'segments');
  fs.mkdirSync(segmentDir, { recursive: true });

  const duration = await getAudioDuration(campaign.audioUrl);

  if (duration < SEGMENT_DURATION) {
    throw new Error(`Track is too short (${duration.toFixed(1)}s). Minimum length is ${SEGMENT_DURATION}s.`);
  }

  // Use user-defined clip start times if available, otherwise evenly space
  const clipDefs = campaign.clipDefinitions as Array<{ startSec: number }> | null;
  const step = duration / NUM_SEGMENTS;
  const segments = Array.from({ length: NUM_SEGMENTS }, (_, i) => {
    const startSec = clipDefs?.[i]?.startSec ?? i * step;
    const endSec = Math.min(startSec + SEGMENT_DURATION, duration);
    return { start: startSec, end: endSec, index: i };
  });

  for (const seg of segments) {
    const outputFile = path.join(segmentDir, `segment_${seg.index}.mp3`);
    await cutSegment(campaign.audioUrl, outputFile, seg.start, seg.end - seg.start);
    await prisma.audioSegment.create({
      data: { campaignId, fileUrl: outputFile, startSec: seg.start, endSec: seg.end, index: seg.index },
    });
  }

  await dispatchStage(campaignId, 'VIDEO_GEN');
}

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      if (!metadata.format.duration) {
        return reject(new Error('Could not determine audio duration — file may be corrupt or in an unsupported format'));
      }
      resolve(metadata.format.duration);
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
