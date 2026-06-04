export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import DeleteCampaignButton from '@/components/DeleteCampaignButton';
import NewCampaignButton from '@/components/NewCampaignButton';
import { Suspense } from 'react';
import PaymentBanner from '@/components/PaymentBanner';

async function getCampaigns(userId: string | null) {
  return prisma.campaign.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: 'desc' },
    include: { jobs: true },
  });
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-600',
  PROCESSING: 'bg-blue-600',
  CONTENT_READY: 'bg-yellow-500',
  BUILDING: 'bg-blue-500',
  READY: 'bg-green-600',
  LAUNCHING: 'bg-purple-600',
  LIVE: 'bg-green-500',
  FAILED: 'bg-red-600',
  PAUSED: 'bg-gray-500',
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
  const campaigns = await getCampaigns(userId);

  // Count non-failed campaigns (includes pre-auth campaigns with userId=null)
  const nonFailedCount = await prisma.campaign.count({
    where: { status: { not: 'FAILED' } },
  });

  let needsPayment = false;
  if (userId && nonFailedCount >= 1) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { campaignCredits: true },
    });
    if (!user || user.campaignCredits <= 0) needsPayment = true;
  }

  return (
    <div>
      {/* Payment success banner — reads ?payment= from URL client-side */}
      <Suspense fallback={null}>
        <PaymentBanner />
      </Suspense>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Campaigns</h1>
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
          {campaigns.map((c: any) => (
            <div key={c.id} className="relative bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 transition">
              <Link href={`/campaigns/${c.id}`} className="block p-6">
                <div className="flex items-center justify-between pr-8">
                  <div>
                    <p className="text-lg font-semibold">{c.songTitle}</p>
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
