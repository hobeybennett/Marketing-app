import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runCopyGen(campaignId: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
  });

  await prisma.adCopy.deleteMany({ where: { campaignId } });

  const variants = await generateAdCopyVariants({
    artistName: campaign.artistName,
    songTitle: campaign.songTitle,
    genre: (campaign as any).genre as string ?? '',
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
  genre: string;
  soundsLike: string[];
  promoteType: string;
}): Promise<CopyVariant[]> {
  const isPlaylist = params.promoteType === 'playlist';
  const soundsLikeLine = params.soundsLike.length > 0
    ? `Sounds like: ${params.soundsLike.join(', ')}`
    : '';
  const genreLine = params.genre ? `Genre: ${params.genre}` : '';

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an expert music marketing copywriter. Generate 5 distinct Facebook/Instagram ad copy variants for this ${isPlaylist ? 'playlist' : 'song'}.

${isPlaylist ? 'Curator' : 'Artist'}: ${params.artistName}
${isPlaylist ? 'Playlist' : 'Song'}: ${params.songTitle}
${genreLine}
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

  const block = message.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(`Unexpected Claude response: ${JSON.stringify(message.content)}`);
  }
  const text = block.text;

  // Try full text first, then find the first JSON array
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array returned from Claude');
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array from Claude');
  return (parsed as CopyVariant[]).slice(0, 5);
}
