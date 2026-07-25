import { prisma } from '../prisma';
import { buildVideoPrompt, generateAiVideoClips } from '../../lib/fal';
import { dispatchStage } from '../../lib/queue';

// Paid AI-video flow. Lyrics were already confirmed by the artist (scan/edit or
// paste) and saved on the campaign — here we generate one AI background clip and
// re-render the creatives (AI background + timed lyrics popping up).
export async function runAiVideoGen(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { id: true, genre: true, mood: true, soundsLike: true },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiVideoStatus: 'GENERATING' },
  });

  // One AI background clip (lyrics come from campaign.lyrics, set by the editor).
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
