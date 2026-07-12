import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXTAUTH_URL || 'https://promohit.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/discover', '/guides', '/go', '/privacy', '/terms'],
        disallow: ['/campaigns', '/settings', '/onboarding', '/admin', '/api/', '/auth/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
