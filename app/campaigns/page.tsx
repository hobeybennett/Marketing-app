export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/prisma';

async function getCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { jobs: true },
  });
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-600',
  PROCESSING: 'bg-blue-600',
  READY: 'bg-yellow-600',
  LAUNCHING: 'bg-purple-600',
  LIVE: 'bg-green-500',
  FAILED: 'bg-red-600',
  PAUSED: 'bg-gray-500',
};

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition"
        >
          New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-xl mb-4">No campaigns yet</p>
          <Link href="/campaigns/new" className="text-blue-400 hover:underline">
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c: any) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">{c.songTitle}</p>
                  <p className="text-gray-400">{c.artistName}</p>
                  {c.genre && <p className="text-sm text-gray-500 mt-1">{c.genre}</p>}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[c.status] ?? 'bg-gray-600'}`}
                >
                  {c.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                {new Date(c.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
