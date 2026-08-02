export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import SmartLinkCreator from './SmartLinkCreator';

export default async function SmartLinksPage() {
  const session = await getServerSession();
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/smartlinks');

  const links = await prisma.campaign.findMany({
    where: { userId: session.user.id, kind: 'SMART_LINK' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      artistName: true,
      songTitle: true,
      createdAt: true,
      _count: { select: { smartLinkClicks: true } },
    },
  });

  const base = process.env.NEXTAUTH_URL || 'https://promohit.marketing';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-700 mb-1">Smart links</h1>
        <p className="text-sm text-gray-400">
          One link for your music, with artwork and click tracking. Share it anywhere — no ad account needed.
        </p>
      </div>

      <div className="mb-8">
        <SmartLinkCreator />
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No smart links yet — paste a Spotify link above to make your first one.
        </p>
      ) : (
        <div className="space-y-2">
          {links.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/covers/${l.id}`} alt="" className="w-12 h-12 rounded object-cover bg-gray-800" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{l.songTitle}</p>
                <p className="text-xs text-gray-400 truncate">{l.artistName}</p>
                <p className="text-xs text-gray-600 truncate mt-0.5">{`${base}/go/${l.id}`}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{l._count.smartLinkClicks}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">clicks</p>
              </div>
              <Link
                href={`/go/${l.id}`}
                target="_blank"
                className="text-xs font-medium text-violet-400 hover:text-violet-300 transition shrink-0"
              >
                Open
              </Link>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600 text-center mt-8">
        Want ads for one of these?{' '}
        <Link href="/campaigns/new" className="text-violet-400 hover:text-violet-300">
          Create a campaign
        </Link>
      </p>
    </div>
  );
}
