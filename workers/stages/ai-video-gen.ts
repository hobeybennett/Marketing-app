import { prisma } from '../prisma';
import { buildVideoPrompt, generateAiVideoClips } from '../../lib/fal';

// Generate the 3 AI background options for a paid campaign, store them, and mark
// the campaign READY so the UI can show the chooser. Best-effort: on failure the
// campaign is marked FAILED-for-ai so the user can retry (and we'd refund).
export async function runAiVideoGen(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { id: true, genre: true, mood: true, soundsLike: true },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiVideoStatus: 'GENERATING' },
  });

  const prompt = buildVideoPrompt({
    genre: campaign.genre,
    mood: campaign.mood,
    soundsLike: campaign.soundsLike,
  });

  const clips = await generateAiVideoClips({ prompt, count: 3, durationSec: 5 });

  if (clips.length === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { aiVideoStatus: 'FAILED' },
    });
    throw new Error('AI video generation returned no clips');
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiVideoStatus: 'READY', aiVideoOptions: clips },
  });
}
