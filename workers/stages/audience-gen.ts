import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

export async function runAudienceGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  await prisma.audience.deleteMany({ where: { campaignId } });

  const audienceName = campaign.soundsLike.length > 0
    ? `Fans of ${campaign.soundsLike.slice(0, 2).join(' & ')}`
    : 'Music Fans';

  await prisma.audience.createMany({
    data: [
      {
        campaignId,
        name: audienceName,
        type: 'INTEREST',
        interests: campaign.soundsLike.length > 0 ? campaign.soundsLike : ['Music', 'Spotify'],
        dataStatus: 'AVAILABLE',
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
