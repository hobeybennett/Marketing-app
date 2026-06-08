import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import MetaConnectSection from './MetaConnectSection';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { meta_error?: string; meta_connected?: string; billing_error?: string };
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
  const billingError = searchParams.billing_error === 'no_customer';

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

      {billingError && (
        <div className="mb-4 rounded-xl border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          No billing record found. Subscribe first, then manage from here.
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <h2 className="font-semibold mb-1">Account</h2>
        <p className="text-sm text-gray-400">{session.user.email}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between mb-3">
          <h2 className="font-semibold">Billing</h2>
          {isPro && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-900/50 border border-violet-700/50 text-violet-300">
              Pro
            </span>
          )}
        </div>
        {isPro ? (
          <>
            <p className="text-sm text-gray-300 mb-1">Promohit Pro · $9.99/month</p>
            <p className="text-xs text-gray-500 mb-4">Unlimited campaigns, renews monthly</p>
            <a href="/api/billing-portal"
              className="inline-flex items-center gap-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-gray-300 transition">
              Manage subscription →
            </a>
            <p className="text-xs text-gray-600 mt-2">Update card, view invoices, cancel — all in one place.</p>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">
                {user?.campaignCredits ?? 0} campaign credit{(user?.campaignCredits ?? 0) !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">First campaign is free · $5 per additional credit</p>
            </div>
            <a href="/api/checkout/pro"
              className="text-sm text-violet-400 hover:text-violet-300 transition font-medium whitespace-nowrap ml-4">
              Go Pro $9.99/mo →
            </a>
          </div>
        )}
      </div>

      <MetaConnectSection connection={metaConnection} />
    </div>
  );
}
