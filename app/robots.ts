import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXTAUTH_URL || 'https://promohit.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/guides', '/privacy', '/terms'],
        // /go smart-links are deliberately NOT indexed: they're thin per-song
        // redirect pages, and letting JS-running crawlers load them would pollute
        // campaign reach/pixel counts.
        disallow: ['/go', '/discover', '/campaigns', '/settings', '/onboarding', '/admin', '/api/', '/auth/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
