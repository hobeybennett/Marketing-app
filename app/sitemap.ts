import { MetadataRoute } from 'next';
import { getPublicCampaigns } from '@/lib/public-campaigns';

// Regenerate hourly so newly-created smart-links get into the sitemap without a
// redeploy (otherwise Next bakes it once at build time with an empty DB).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXTAUTH_URL || 'https://promohit.app';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/discover`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/guides/facebook-ads-for-musicians`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  // Every public smart-link page — one per campaign with a real streaming link.
  const campaigns = await getPublicCampaigns();
  const smartLinks: MetadataRoute.Sitemap = campaigns.map((c) => ({
    url: `${base}/go/${c.id}`,
    lastModified: c.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...smartLinks];
}
