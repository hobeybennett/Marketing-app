export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import DeleteCampaignButton from '@/components/DeleteCampaignButton';
import NewCampaignButton from '@/components/NewCampaignButton';
import { Suspense } from 'react';
import PaymentBanner from '@/components/PaymentBanner';

async function getCampaigns(userId: string | null) {
  const campaigns = await prisma.campaign.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: 'desc' },
    include: { jobs: true },
  });

  const liveIds = campaigns.filter(c => c.status === 'LIVE').map(c => c.id);

  let spendMap: Record<string, number> = {};
  let clickMap: Record<string, number> = {};

  if (liveIds.length > 0) {
    const spendData = await prisma.adInsight.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: liveIds }, metaAdSetId: null, metaAdId: null },
      _sum: { spend: true },
    });
    const clickData = await prisma.smartLinkClick.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: liveIds } },
      _count: { id: true },
    });
    spendMap = Object.fromEntries(spendData.map(s => [s.campaignId, s._sum.spend ?? 0]));
    clickMap = Object.fromEntries(clickData.map(c => [c.campaignId, c._count.id ?? 0]));
  }

  return { campaigns, spendMap, clickMap };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-700 text-gray-300',
  PROCESSING: 'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  CONTENT_READY: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50',
  BUILDING: 'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  READY: 'bg-violet-900/50 text-violet-300 border border-violet-700/50',
  LAUNCHING: 'bg-violet-900/50 text-violet-300 border border-violet-700/50',
  LIVE: 'bg-green-900/50 text-green-300 border border-green-700/50',
  FAILED: 'bg-red-900/50 text-red-300 border border-red-700/50',
  PAUSED: 'bg-gray-700 text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Creating content',
  CONTENT_READY: 'Content ready',
  BUILDING: 'Building campaign',
  READY: 'Ready to launch',
  LAUNCHING: 'Launching',
  LIVE: 'Live',
  FAILED: 'Failed',
  PAUSED: 'Paused',
};

export default async function CampaignsPage() {
  const session = await getServerSession();
  const userId = session?.user?.id ?? null;
  const { campaigns, spendMap, clickMap } = await getCampaigns(userId);

  let needsPayment = false;
  if (userId) {
    const userCampaignCount = await prisma.campaign.count({
      where: { userId, status: { not: 'FAILED' } },
    });
    if (userCampaignCount >= 1) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { campaignCredits: true },
      });
      if (!user || user.campaignCredits <= 0) needsPayment = true;
    }
  }

  return (
    <div>
      {/* Payment success banner — reads ?payment= from URL client-side */}
      <Suspense fallback={null}>
        <PaymentBanner />
      </Suspense>

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl font-700">Campaigns</h1>
        <NewCampaignButton needsPayment={needsPayment} />
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
          {campaigns.map((c) => (
            <div key={c.id} className="relative bg-gray-900 border border-gray-800 rounded-xl card-hover transition">
              <Link href={`/campaigns/${c.id}`} className="block p-6">
                <div className="flex items-center justify-between pr-8">
                  <div>
                    <p className="font-display text-lg font-700">{c.songTitle}</p>
                    <p className="text-gray-400">{c.artistName}</p>
                    {c.genre && <p className="text-sm text-gray-500 mt-1">{c.genre}</p>}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[c.status] ?? 'bg-gray-600'}`}
                  >
                    {STATUS_LABELS[c.status] ?? c.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  {new Date(c.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                {c.status === 'LIVE' && ((spendMap[c.id] ?? 0) > 0 || (clickMap[c.id] ?? 0) > 0) && (
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    {(spendMap[c.id] ?? 0) > 0 && <span>${(spendMap[c.id] as number).toFixed(2)} spent</span>}
                    {(clickMap[c.id] ?? 0) > 0 && <span>{clickMap[c.id]} link clicks</span>}
                    <Link href={`/campaigns/${c.id}/insights`} onClick={e => e.stopPropagation()}
                      className="text-violet-400 hover:text-violet-300 transition ml-auto">
                      View stats →
                    </Link>
                  </div>
                )}
              </Link>
              <div className="absolute top-5 right-5">
                <DeleteCampaignButton campaignId={c.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
