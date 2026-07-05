export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
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

  const activeIds = campaigns
    .filter(c => c.status === 'LIVE' || c.status === 'PAUSED')
    .map(c => c.id);

  type StatRow = { spend: number; outboundClicks: number; videoViews: number; conversions: number };
  let statsMap: Record<string, StatRow> = {};

  if (activeIds.length > 0) {
    const [insightData, clickData] = await Promise.all([
      prisma.adInsight.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: activeIds }, metaAdSetId: null, metaAdId: null },
        _sum: { spend: true, outboundClicks: true, videoViews: true },
      }),
      // Conversions = clicks through to a streaming platform (Spotify); page_view excluded.
      prisma.smartLinkClick.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: activeIds }, platform: { not: 'page_view' } },
        _count: { _all: true },
      }),
    ]);
    const convMap: Record<string, number> = Object.fromEntries(
      clickData.map(c => [c.campaignId, c._count._all]),
    );
    for (const id of activeIds) {
      const s = insightData.find(r => r.campaignId === id);
      statsMap[id] = {
        spend: s?._sum.spend ?? 0,
        outboundClicks: s?._sum.outboundClicks ?? 0,
        videoViews: s?._sum.videoViews ?? 0,
        conversions: convMap[id] ?? 0,
      };
    }
  }

  return { campaigns, statsMap };
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
  const { campaigns, statsMap } = await getCampaigns(userId);

  // First-time users go through onboarding before seeing an empty dashboard
  if (userId && campaigns.length === 0) {
    redirect('/onboarding');
  }

  let needsPayment = false;
  let credits = 0;
  let isPro = false;

  let hasMetaConnection = false;

  if (userId) {
    const [user, metaConnection] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { campaignCredits: true, subscriptionStatus: true },
      }),
      prisma.metaConnection.findUnique({ where: { userId } }),
    ]);
    credits = user?.campaignCredits ?? 0;
    isPro = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
    hasMetaConnection = !!metaConnection;

    const userCampaignCount = await prisma.campaign.count({
      where: { userId, status: { not: 'FAILED' } },
    });
    if (userCampaignCount >= 1 && !isPro && credits <= 0) {
      needsPayment = true;
    }
  }

  return (
    <div>
      {/* Payment success banner — reads ?payment= from URL client-side */}
      <Suspense fallback={null}>
        <PaymentBanner />
      </Suspense>

      {/* Meta account setup nudge */}
      {userId && !hasMetaConnection && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-700/50 bg-amber-900/15 px-4 py-3">
          <div className="flex items-center gap-3">
            <p className="text-sm text-amber-200">
              Connect your Meta account to run campaigns on Facebook &amp; Instagram.
            </p>
          </div>
          <a href="/connect-meta"
            className="shrink-0 text-xs font-semibold text-amber-300 hover:text-amber-100 border border-amber-700/60 hover:border-amber-500 px-3 py-1.5 rounded-lg transition whitespace-nowrap">
            Connect Meta
          </a>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl font-700">Campaigns</h1>
        <div className="flex items-center gap-3">
          {userId && (
            isPro ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-900/50 border border-violet-700/50 text-violet-300">
                Pro ∞
              </span>
            ) : (
              <span className="text-xs text-gray-500">
                {credits} credit{credits !== 1 ? 's' : ''}
              </span>
            )
          )}
          <NewCampaignButton needsPayment={needsPayment} isPro={isPro} credits={credits} />
        </div>
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
              <Link href={(c.status === 'LIVE' || c.status === 'PAUSED') ? `/campaigns/${c.id}/insights` : `/campaigns/${c.id}`} className="block px-6 pt-6 pb-4 pr-14">
                <div className="flex items-center justify-between">
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
              </Link>
              {(c.status === 'LIVE' || c.status === 'PAUSED') && (() => {
                const s = statsMap[c.id] ?? { spend: 0, outboundClicks: 0, videoViews: 0, conversions: 0 };
                const costPerConv = s.conversions > 0 ? s.spend / s.conversions : null;
                return (
                  <div className="border-t border-gray-800 px-6 pb-5 pt-4">
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <p className="text-sm font-600 tabular-nums">
                          {s.conversions >= 1000
                            ? `${(s.conversions / 1000).toFixed(1)}k`
                            : s.conversions.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">Conversions</p>
                      </div>
                      <div>
                        <p className="text-sm font-600 tabular-nums">
                          {costPerConv != null ? `$${costPerConv.toFixed(2)}` : '—'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">Cost per conversion</p>
                      </div>
                      <div>
                        <p className="text-sm font-600 tabular-nums">${s.spend.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Spent</p>
                      </div>
                    </div>
                    <Link href={`/campaigns/${c.id}/insights`}
                      className="text-xs text-violet-400 hover:text-violet-300 transition">
                      View full stats
                    </Link>
                  </div>
                );
              })()}
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
