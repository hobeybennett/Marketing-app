import { prisma } from '../prisma';
import { buildVideoPrompt, generateAiVideoClips, transcribeAudio } from '../../lib/fal';
import { dispatchStage } from '../../lib/queue';

// Paid AI-video flow: transcribe the track for lyrics, generate one AI background
// clip, then re-render the creatives (AI background + timed lyrics popping up).
export async function runAiVideoGen(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { id: true, genre: true, mood: true, soundsLike: true },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiVideoStatus: 'GENERATING' },
  });

  // 1. Lyrics (best-effort — a lyric-video look, corrected by the artist later).
  try {
    const base = process.env.NEXTAUTH_URL || 'https://promohit.marketing';
    const transcript = await transcribeAudio(`${base}/api/audio/${campaignId}`);
    if (transcript?.chunks?.length) {
      await prisma.campaign.update({ where: { id: campaignId }, data: { lyrics: transcript.chunks } });
      console.log(`[ai-video-gen] transcribed ${transcript.chunks.length} lyric lines`);
    }
  } catch (err) {
    console.warn('[ai-video-gen] transcription skipped:', err instanceof Error ? err.message : err);
  }

  // 2. One AI background clip.
  const prompt = buildVideoPrompt({
    genre: campaign.genre,
    mood: campaign.mood,
    soundsLike: campaign.soundsLike,
  });
  const clips = await generateAiVideoClips({ prompt, count: 1, durationSec: 5 });

  if (clips.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { aiVideoStatus: 'FAILED' } });
    throw new Error('AI video generation returned no clips');
  }

  // 3. Apply it and re-render the creatives.
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiVideoStatus: 'APPLIED', aiVideoOptions: clips },
  });
  await dispatchStage(campaignId, 'VIDEO_GEN');
}
