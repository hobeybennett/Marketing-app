import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import MetaConnectSection from './MetaConnectSection';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { meta_error?: string; meta_connected?: string };
}) {
  const session = await getServerSession();
  if (!session?.user?.id) redirect('/auth/signin');

  const [metaConnection, user] = await Promise.all([
    prisma.metaConnection.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { campaignCredits: true, subscriptionStatus: true, subscriptionId: true },
    }),
  ]);
  const isPro = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';

  const metaError = searchParams.meta_error
    ? decodeURIComponent(searchParams.meta_error)
    : null;
  const metaConnected = searchParams.meta_connected === '1';

  return (
    <div className="max-w-xl mx-auto py-8">
      <h1 className="font-display text-2xl font-700 mb-8">Settings</h1>

      {metaConnected && (
        <div className="mb-4 rounded-xl border border-green-700 bg-green-900/20 px-4 py-3 text-sm text-green-300">
          Meta account connected successfully.
        </div>
      )}

      {metaError && (
        <div className="mb-4 rounded-xl border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          <p className="font-semibold mb-1">Meta connection failed</p>
          <p className="text-red-400/80 break-words">{metaError}</p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <h2 className="font-semibold mb-1">Account</h2>
        <p className="text-sm text-gray-400">{session.user.email}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <h2 className="font-semibold mb-3">Billing</h2>
        {isPro ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">Promohit Pro</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-900/50 border border-violet-700/50 text-violet-300">Active</span>
              </div>
              <p className="text-sm text-gray-400">Unlimited campaigns · $29.99/month</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">{user?.campaignCredits ?? 0} campaign credit{(user?.campaignCredits ?? 0) !== 1 ? 's' : ''}</p>
              <p className="text-xs text-gray-500 mt-0.5">First campaign is free</p>
            </div>
            <a href="/api/checkout/pro"
              className="text-sm text-violet-400 hover:text-violet-300 transition font-medium">
              Upgrade to Pro →
            </a>
          </div>
        )}
      </div>

      <MetaConnectSection connection={metaConnection} />
    </div>
  );
}
