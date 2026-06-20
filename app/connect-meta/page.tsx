import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STEPS = [
  {
    n: '01',
    title: 'Facebook account',
    desc: 'You need a personal Facebook account to get started. If you already have one, skip this.',
    action: 'Create a Facebook account',
    href: 'https://www.facebook.com/r.php',
    note: null,
  },
  {
    n: '02',
    title: 'Meta Business Manager',
    desc: 'Business Manager is where you manage your ad accounts and pages. Create one at business.facebook.com.',
    action: 'Open Business Manager',
    href: 'https://business.facebook.com/overview',
    note: 'Click "Create account" in the top right if you don\'t have one yet.',
  },
  {
    n: '03',
    title: 'Ad Account',
    desc: 'An Ad Account is the billing entity that runs your campaigns. You need at least one active ad account.',
    action: 'Create an Ad Account',
    href: 'https://business.facebook.com/latest/settings/ad-accounts',
    note: 'In Business Manager: Settings → Accounts → Ad Accounts → Add → Create a New Ad Account.',
  },
  {
    n: '04',
    title: 'Facebook Page',
    desc: 'Your ads appear to come from a Facebook Page — even if you never post on it. Create a simple artist page.',
    action: 'Create a Facebook Page',
    href: 'https://www.facebook.com/pages/creation/',
    note: 'After creating, add it to Business Manager: Settings → Accounts → Pages → Add Page.',
  },
  {
    n: '05',
    title: 'Add a payment method',
    desc: 'Add a credit or debit card to your Ad Account so your ads can actually spend. Without this, campaigns won\'t deliver.',
    action: 'Open Billing in Ads Manager',
    href: 'https://adsmanager.facebook.com/adsmanager/manage/billing',
    note: 'Make sure you\'re in your Ad Account, not Business Manager, when adding billing.',
  },
];

export default async function ConnectMetaPage() {
  const session = await getServerSession();
  if (!session?.user) redirect('/auth/signin');

  return (
    <div className="max-w-xl mx-auto pb-20">
      {/* Header */}
      <div className="pt-8 pb-10">
        <Link href="/settings" className="text-xs text-gray-500 hover:text-gray-300 transition mb-6 block">
          Back to settings
        </Link>
        <h1 className="font-display text-3xl font-700 mb-2">Set up Meta Ads</h1>
        <p className="text-gray-400">
          Takes about 5 minutes. Follow each step on Facebook, then come back to connect.
        </p>

        {/* Already set up shortcut */}
        <div className="mt-5 flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-sm text-gray-400 flex-1">Already have a Meta Business account?</p>
          <a
            href="/api/auth/meta"
            className="shrink-0 text-sm font-semibold text-violet-300 hover:text-violet-100 border border-violet-700/60 hover:border-violet-500 px-4 py-2 rounded-lg transition"
          >
            Connect now
          </a>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3 mb-10">
        {STEPS.map((step) => (
          <div key={step.n} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <span className="font-mono text-xs font-semibold text-violet-400 mt-0.5 shrink-0 w-6">{step.n}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-white mb-1">{step.title}</p>
                <p className="text-sm text-gray-400 leading-relaxed mb-3">{step.desc}</p>
                {step.note && (
                  <p className="text-xs text-gray-600 mb-3 leading-relaxed">{step.note}</p>
                )}
                <a
                  href={step.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 border border-blue-800/50 hover:border-blue-600 px-3 py-1.5 rounded-lg transition"
                >
                  {step.action}
                  <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Final CTA */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
        <p className="font-display text-lg font-700 mb-1">All done?</p>
        <p className="text-sm text-gray-400 mb-5">
          Connect your Meta account to Promohit and you&apos;re ready to run your first campaign.
        </p>
        <a
          href="/api/auth/meta"
          className="btn-primary inline-block px-8 py-3 text-sm font-semibold"
        >
          Connect Meta to Promohit
        </a>
        <p className="text-xs text-gray-600 mt-3">
          You&apos;ll be redirected to Facebook to authorise the connection.
        </p>
      </div>
    </div>
  );
}
