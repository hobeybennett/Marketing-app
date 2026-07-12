import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicCampaigns, coverSrc } from '@/lib/public-campaigns';

// Rebuild hourly — fresh enough for new releases without hammering the DB.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Discover New Music',
  description:
    'Discover new songs and independent artists promoted with Promohit. Stream the latest releases on Spotify.',
  alternates: { canonical: '/discover' },
  openGraph: {
    title: 'Discover New Music | Promohit',
    description: 'Stream the latest independent releases promoted with Promohit.',
    url: '/discover',
  },
};

export default async function DiscoverPage() {
  const campaigns = await getPublicCampaigns(500);

  return (
    <div className="max-w-5xl mx-auto py-10 px-2">
      <header className="mb-8 text-center">
        <h1 className="font-display text-3xl font-700 mb-2 gradient-text">Discover New Music</h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          Fresh songs and independent artists promoted with Promohit. Tap any release to
          stream it on Spotify.
        </p>
      </header>

      {campaigns.length === 0 ? (
        <p className="text-center text-gray-500 py-12">
          No releases yet — be the first.{' '}
          <Link href="/" className="text-violet-400 hover:text-violet-300 underline">
            Promote your track →
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/go/${c.id}`}
                className="block group rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-700 transition"
              >
                <div className="aspect-square bg-gray-800 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverSrc(c)}
                    alt={`${c.songTitle} by ${c.artistName} cover art`}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-white truncate">{c.songTitle}</p>
                  <p className="text-xs text-gray-500 truncate uppercase tracking-wide">{c.artistName}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-12 text-center">
        <p className="text-sm text-gray-400 mb-3">Are you an artist? Get your song heard.</p>
        <Link href="/" className="btn-primary inline-block px-6 py-2.5 text-sm font-semibold">
          Promote your music free
        </Link>
      </div>
    </div>
  );
}
