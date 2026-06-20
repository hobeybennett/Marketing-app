import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runCopyGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
  });

  await prisma.adCopy.deleteMany({ where: { campaignId } });

  const variants = await generateAdCopyVariants({
    artistName: campaign.artistName,
    songTitle: campaign.songTitle,
    soundsLike: campaign.soundsLike,
    promoteType: campaign.promoteType ?? 'track',
  });

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    await prisma.adCopy.create({
      data: {
        campaignId,
        creativeId: null,
        isSelected: i === 0,
        headline: v.headline,
        primaryText: v.primaryText,
        description: v.description ?? null,
      },
    });
  }

  await dispatchStage(campaignId, 'AUDIENCE_GEN');
}

type CopyVariant = { headline: string; primaryText: string; description?: string };

async function generateAdCopyVariants(params: {
  artistName: string;
  songTitle: string;
  soundsLike: string[];
  promoteType: string;
}): Promise<CopyVariant[]> {
  const isPlaylist = params.promoteType === 'playlist';
  const soundsLikeLine = params.soundsLike.length > 0
    ? `Sounds like: ${params.soundsLike.join(', ')}`
    : '';

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an expert music marketing copywriter. Generate 5 distinct Facebook/Instagram ad copy variants for this ${isPlaylist ? 'playlist' : 'song'}.

${isPlaylist ? 'Curator' : 'Artist'}: ${params.artistName}
${isPlaylist ? 'Playlist' : 'Song'}: ${params.songTitle}
${soundsLikeLine}

${soundsLikeLine ? `Each variant should lead the primaryText with "For fans of ${params.soundsLike.join(' and ')}..." to hook the right listeners.` : ''}

Create 5 genuinely different angles — try: emotional connection, pure hype, curiosity/intrigue, atmospheric/mood, direct call to action. Each should feel distinct.

Return ONLY a valid JSON array of exactly 5 objects:
[
  { "headline": "under 40 chars", "primaryText": "1-2 sentences under 125 chars", "description": "optional under 30 chars" },
  { "headline": "...", "primaryText": "...", "description": "..." },
  { "headline": "...", "primaryText": "...", "description": "..." },
  { "headline": "...", "primaryText": "...", "description": "..." },
  { "headline": "...", "primaryText": "...", "description": "..." }
]`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array returned from Claude');
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');
    return parsed.slice(0, 5);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
