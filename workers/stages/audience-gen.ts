import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

export async function runAudienceGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  await prisma.audience.deleteMany({ where: { campaignId } });

  const baseName = campaign.soundsLike.length > 0
    ? campaign.soundsLike.slice(0, 2).join(' & ')
    : 'Music';

  const interests = campaign.soundsLike.length > 0 ? campaign.soundsLike : ['Music', 'Spotify'];

  await prisma.audience.createMany({
    data: [
      {
        campaignId,
        name: `${baseName} — Interest`,
        type: 'INTEREST',
        interests,
        dataStatus: 'AVAILABLE',
      },
      {
        campaignId,
        name: `${campaign.artistName} — Retargeting`,
        type: 'RETARGETING',
        interests: [],
        dataStatus: 'PENDING_DATA',
        availabilityNote: 'Activates once your campaign has 100 landing page visitors',
      },
      {
        campaignId,
        name: `${baseName} — Lookalike`,
        type: 'LOOKALIKE',
        interests,
        dataStatus: 'PENDING_DATA',
        availabilityNote: 'Activates once you have 100 source audience members',
      },
    ],
  });

  if (campaign.autoLaunch) {
    // Dispatch before updating status so status only advances if dispatch succeeds
    await dispatchStage(campaignId, 'META_SETUP');
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'LAUNCHING' } });
  } else {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'READY' } });
  }
}
