import { PrismaClient } from '@prisma/client';
import { dispatchStage } from '../../lib/queue';

const prisma = new PrismaClient();

const DEFAULT_INTERESTS = ['Music streaming', 'Music fans', 'Spotify', 'Apple Music'];

export async function runAudienceGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  await prisma.audience.createMany({
    data: [
      {
        campaignId,
        name: 'Music Fans',
        type: 'INTEREST',
        interests: DEFAULT_INTERESTS,
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
      data: { status: 'READY' },
    });
  }
}
