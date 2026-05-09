import { PrismaClient } from '@prisma/client';
import { dispatchStage } from '../../lib/queue';

const prisma = new PrismaClient();

const GENRE_INTERESTS: Record<string, string[]> = {
  pop: ['Pop music', 'Music streaming', 'Top 40'],
  'hip-hop': ['Hip hop music', 'Rap music', 'Urban music'],
  'r&b': ['R&B music', 'Soul music', 'Neo soul'],
  rock: ['Rock music', 'Alternative rock', 'Indie music'],
  electronic: ['Electronic music', 'EDM', 'House music'],
  country: ['Country music', 'Folk music'],
  default: ['Music streaming', 'Music fans', 'Spotify', 'Apple Music'],
};

export async function runAudienceGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  const genreKey = (campaign.genre ?? 'default').toLowerCase();
  const interests = GENRE_INTERESTS[genreKey] ?? GENRE_INTERESTS.default;

  await prisma.audience.createMany({
    data: [
      {
        campaignId,
        name: `${campaign.genre ?? 'Music'} Fans`,
        type: 'INTEREST',
        interests,
      },
      {
        campaignId,
        name: 'Retargeting — Website Visitors',
        type: 'RETARGETING',
        interests: [],
        retargetingSource: 'website_visitors_180d',
      },
      {
        campaignId,
        name: 'Lookalike — 1% US',
        type: 'LOOKALIKE',
        interests: [],
        lookalikeSeed: 'page_fans',
      },
    ],
  });

  if (campaign.autoLaunch) {
    await dispatchStage(campaignId, 'META_SETUP');
  } else {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'AWAITING_APPROVAL' },
    });
  }
}
