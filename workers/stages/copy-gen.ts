import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runCopyGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { creatives: true },
  });

  await prisma.adCopy.deleteMany({ where: { campaignId } });

  for (const creative of campaign.creatives) {
    const copy = await generateAdCopy({
      artistName: campaign.artistName,
      songTitle: campaign.songTitle,
      ctaText: creative.ctaText,
      soundsLike: campaign.soundsLike,
      promoteType: campaign.promoteType ?? 'track',
    });

    await prisma.adCopy.create({
      data: {
        campaignId,
        creativeId: creative.id,
        headline: copy.headline,
        primaryText: copy.primaryText,
        description: copy.description ?? null,
      },
    });
  }

  await dispatchStage(campaignId, 'AUDIENCE_GEN');
}

async function generateAdCopy(params: {
  artistName: string;
  songTitle: string;
  ctaText: string;
  soundsLike: string[];
  promoteType: string;
}): Promise<{ headline: string; primaryText: string; description?: string }> {
  const isPlaylist = params.promoteType === 'playlist';
  const soundsLikeLine = params.soundsLike.length > 0
    ? `Sounds like: ${params.soundsLike.join(', ')}`
    : '';

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `You are an expert music marketing copywriter. Generate Facebook/Instagram ad copy for this ${isPlaylist ? 'playlist' : 'song'}.

${isPlaylist ? 'Curator' : 'Artist'}: ${params.artistName}
${isPlaylist ? 'Playlist' : 'Song'}: ${params.songTitle}
CTA: ${params.ctaText}
${soundsLikeLine}

${soundsLikeLine ? `Lead the primaryText with "For fans of ${params.soundsLike.join(' and ')}..." to hook the right listeners.` : ''}

Return ONLY valid JSON:
{
  "headline": "punchy headline under 40 chars",
  "primaryText": "1-3 sentence ad copy under 125 chars",
  "description": "optional link description under 30 chars"
}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON returned from Claude');
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
