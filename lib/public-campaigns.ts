import { prisma } from '@/lib/prisma';

export type PublicCampaign = {
  id: string;
  artistName: string;
  songTitle: string;
  coverArtUrl: string;
  updatedAt: Date;
};

// Campaigns whose /go smart-link is a meaningful, indexable public page: they
// have a real streaming destination. Excludes half-built or failed drafts so we
// never surface an empty smart-link in the sitemap or /discover hub.
export async function getPublicCampaigns(limit = 5000): Promise<PublicCampaign[]> {
  try {
    return await prisma.campaign.findMany({
      where: {
        OR: [
          { spotifyUrl: { not: null } },
          { spotifyPlaylistUrl: { not: null } },
        ],
      },
      select: { id: true, artistName: true, songTitle: true, coverArtUrl: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  } catch {
    // Never let a DB hiccup break the sitemap / discover page build.
    return [];
  }
}

// Absolute-safe cover art source: Spotify CDN URLs are already absolute; local
// uploads are served through our covers proxy.
export function coverSrc(c: { id: string; coverArtUrl: string }): string {
  return c.coverArtUrl?.startsWith('http') ? c.coverArtUrl : `/api/covers/${c.id}`;
}
