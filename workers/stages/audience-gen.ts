import { prisma } from '../prisma';
import { dispatchStage } from '../../lib/queue';

export async function runAudienceGen(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  await prisma.audience.deleteMany({ where: { campaignId } });

  const baseName = campaign.soundsLike.length > 0
    ? campaign.soundsLike.slice(0, 2).join(' & ')
    : 'Music';

  const interests = campaign.soundsLike.length > 0 ? campaign.soundsLike : ['Music', 'Spotify'];

  // A single Advantage+ interest audience — matches the proven reference campaign.
  // (Retargeting + lookalike need pixel/source data a new campaign doesn't have
  // yet; they'll return as a real feature once there's logic to build them.)
  await prisma.audience.create({
    data: {
      campaignId,
      name: `${baseName} fans`,
      type: 'INTEREST',
      interests,
      dataStatus: 'AVAILABLE',
    },
  });

  // Video generation is the slow stage — run it LAST, after copy + audiences
  // are ready, so the user can start reviewing while videos render. Campaign
  // stays PROCESSING; VIDEO_GEN flips it to READY (or LAUNCHING for autoLaunch).
  await dispatchStage(campaignId, 'VIDEO_GEN');
}
