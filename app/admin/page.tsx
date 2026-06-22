import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AdminUsers from './AdminUsers';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'hobeybennett@gmail.com';

export default async function AdminPage() {
  const session = await getServerSession();
  if (session?.user?.email !== ADMIN_EMAIL) redirect('/campaigns');

  const [users, totalCampaigns, liveCampaigns, stripeEvents] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        subscriptionStatus: true,
        campaignCredits: true,
        subscriptionId: true,
        _count: { select: { campaigns: true } },
      },
    }),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: 'LIVE' } }),
    prisma.stripeEvent.count(),
  ]);

  const proUsers = users.filter(u => u.subscriptionStatus === 'active' || u.subscriptionStatus === 'trialing').length;
  const estimatedRevenue = (stripeEvents * 2.99).toFixed(2);

  const stats = [
    { label: 'Total Users', value: users.length },
    { label: 'Pro Subscribers', value: proUsers },
    { label: 'Campaigns', value: totalCampaigns, sub: `${liveCampaigns} live` },
    { label: 'Est. Revenue', value: `$${estimatedRevenue}`, sub: 'AUD' },
  ];

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-700">Admin</h1>
          <p className="text-xs text-gray-600 mt-0.5">Promohit system dashboard</p>
        </div>
        <span className="text-xs font-mono bg-gray-900 border border-gray-800 px-2 py-1 rounded text-gray-500">
          {session.user.email}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {stats.map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold tabular-nums text-white">{stat.value}</p>
            {stat.sub && <p className="text-xs text-gray-600 mt-0.5">{stat.sub}</p>}
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Users */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Users <span className="text-gray-600 font-normal">({users.length})</span></h2>
        </div>
        <AdminUsers initialUsers={users as any} />
      </div>
    </div>
  );
}
