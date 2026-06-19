import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

const DEFAULT_INTERESTS = ['Music streaming', 'Music fans', 'Spotify', 'Apple Music'];

export async function runAudienceGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  await prisma.audience.deleteMany({ where: { campaignId } });

  await prisma.audience.createMany({
    data: [
      {
        campaignId,
        name: 'Music Fans',
        type: 'INTEREST',
        interests: DEFAULT_INTERESTS,
        dataStatus: 'AVAILABLE',
      },
      {
        campaignId,
        name: 'Retargeting — Website Visitors',
        type: 'RETARGETING',
        interests: [],
        retargetingSource: 'website_visitors_180d',
        dataStatus: 'PENDING_DATA',
        availabilityNote: 'Retargeting audience requires at least 100 landing page visitors. Will activate automatically once traffic builds.',
      },
      {
        campaignId,
        name: 'Lookalike — Top 1%',
        type: 'LOOKALIKE',
        interests: [],
        lookalikeSeed: 'page_fans',
        dataStatus: 'PENDING_DATA',
        availabilityNote: 'Lookalike audience requires at least 100 source audience members. Will activate automatically once retargeting data builds.',
      },
    ],
  });

  if (campaign.autoLaunch) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'LAUNCHING' } });
    await dispatchStage(campaignId, 'META_SETUP');
  } else {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'READY' } });
  }
}
