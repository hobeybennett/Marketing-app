import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import './globals.css';
import SessionProvider from '@/components/SessionProvider';
import UserNav from '@/components/UserNav';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'https://promohit.marketing'),
  title: {
    default: 'Promohit — Automated Music Promotion on Facebook & Instagram',
    template: '%s | Promohit',
  },
  description: 'Promohit turns your track into 5 video ads and launches them on Facebook and Instagram automatically. AI-written copy, smart targeting, real results. First campaign free.',
  keywords: [
    'music promotion', 'music marketing', 'Facebook ads for musicians',
    'Instagram ads for artists', 'promote music online', 'automated music advertising',
    'Meta ads music', 'indie artist promotion', 'music campaign', 'Spotify promotion',
  ],
  authors: [{ name: 'Promohit' }],
  creator: 'Promohit',
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: '/',
    siteName: 'Promohit',
    title: 'Promohit — Automated Music Promotion on Facebook & Instagram',
    description: 'Turn your track into 5 video ads and launch them on Facebook & Instagram automatically. AI copy, smart targeting, first campaign free.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Promohit — Automated Music Promotion' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Promohit — Automated Music Promotion',
    description: 'Turn your track into 5 video ads and launch them on Facebook & Instagram automatically.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  other: {
    'facebook-domain-verification': '646ok5rl4e9mpirah1l5gy0nyoumxz',
  },
};

const SITE_URL = process.env.NEXTAUTH_URL || 'https://promohit.marketing';

// Brand-entity structured data. Organization gives Google a knowledge-graph
// anchor for "Promohit"; WebSite marks the canonical site name/URL.
const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Promohit',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description:
    'Promohit is an automated music promotion platform that turns a track into video ads and launches them on Facebook and Instagram automatically.',
};

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Promohit',
  url: SITE_URL,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 font-body">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([orgJsonLd, siteJsonLd]) }}
        />
        <SessionProvider>
          <nav className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
            <Link href="/campaigns" className="font-display text-lg font-700 gradient-text tracking-tight">
              Promohit
            </Link>
            <UserNav />
          </nav>
          <main className="container mx-auto px-4 py-8">{children}</main>
          <footer className="border-t border-gray-800 px-6 py-4 flex items-center justify-center gap-6 text-xs text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300 transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition">Terms &amp; Conditions</Link>
          </footer>
        </SessionProvider>
        <Script id="crisp-chat" strategy="afterInteractive">{`
          window.$crisp=[];
          window.CRISP_WEBSITE_ID="be0fb9a0-faf7-4b05-984b-6c0d2b34d19a";
          (function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
        `}</Script>
      </body>
    </html>
  );
}
