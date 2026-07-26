import { prisma } from '../prisma';
import { buildVideoPrompt, generateAiVideoClips } from '../../lib/fal';
import { dispatchStage } from '../../lib/queue';

// Paid AI-video flow. The artist optionally described the background they want
// (campaign.aiVideoPrompt). Here we generate one AI background clip and re-render
// the creatives with it looping behind the normal hook/CTA overlay.
export async function runAiVideoGen(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { id: true, genre: true, mood: true, soundsLike: true, aiVideoPrompt: true },
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiVideoStatus: 'GENERATING' },
  });

  // Use the artist's own prompt if they gave one; otherwise auto-build from the
  // track's genre/mood. Always append the compositing constraints (no text/faces)
  // so it sits cleanly behind our overlay.
  const custom = campaign.aiVideoPrompt?.trim();
  const prompt = custom
    ? `${custom}. Cinematic, dynamic motion, rich lighting and colour, film grain. No text, no logos, no faces. Seamless, high quality.`
    : buildVideoPrompt({
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
