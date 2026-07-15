import { prisma } from '../prisma';
import { fetchTrackPopularity } from '../../lib/spotify';

// Record today's Spotify popularity (0-100) for a campaign's track. Upserts one
// row per calendar day so re-running on the sync cadence just refreshes the
// day's value. Best-effort — never throws.
export async function takePopularitySnapshot(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { spotifyUrl: true },
  });
  if (!campaign?.spotifyUrl) return;

  const popularity = await fetchTrackPopularity(campaign.spotifyUrl);
  if (popularity == null) return;

  // Normalise to UTC midnight → one row per calendar day.
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);

  await prisma.popularitySnapshot.upsert({
    where: { campaignId_date: { campaignId, date: day } },
    create: { campaignId, date: day, popularity },
    update: { popularity },
  });
}
