import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import CampaignNewForm from './CampaignNewForm';

export default async function NewCampaignPage() {
  const session = await getServerSession();

  const metaConnection = session?.user?.id
    ? await prisma.metaConnection.findUnique({ where: { userId: session.user.id } })
    : null;

  if (!metaConnection) {
    return (
      <>
        <style>{`
          @keyframes step-in {
            from { opacity: 0; transform: translateY(14px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .step-1 { animation: step-in 0.5s ease both 0.05s; }
          .step-2 { animation: step-in 0.5s ease both 0.15s; }
          .step-3 { animation: step-in 0.5s ease both 0.25s; }
          .step-4 { animation: step-in 0.5s ease both 0.35s; }
          .header-in { animation: step-in 0.5s ease both 0s; }

          @keyframes pulse-ring {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.08); }
          }
          .time-chip-dot { animation: pulse-ring 2s ease-in-out infinite; }
        `}</style>

        <div className="max-w-[480px] mx-auto py-6 pb-16">

          {/* Back link */}
          <Link
            href="/campaigns"
            className="header-in inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-8"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to campaigns
          </Link>

          {/* Header */}
          <div className="header-in mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="font-display text-2xl font-700">Set up Meta Ads</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-gray-700 bg-gray-900 text-gray-400">
                <span className="time-chip-dot w-1.5 h-1.5 rounded-full bg-green-400 inline-block shrink-0" />
                ~5 minutes
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Before you can run ads, you need a few things set up on Meta&apos;s side.
              Follow these steps once and you&apos;re good to go for every future campaign.
            </p>
          </div>

          {/* Steps */}
          <div className="relative">

            {/* Dashed connector line */}
            <div
              className="absolute left-[19px] top-10 bottom-[120px] w-px pointer-events-none"
              style={{ background: 'repeating-linear-gradient(to bottom, rgba(99,102,241,0.3) 0px, rgba(99,102,241,0.3) 5px, transparent 5px, transparent 11px)' }}
            />

            {/* ── Step 1 ─────────────────────────────────────────────── */}
            <div className="step-1 flex gap-4 mb-5">
              <div className="shrink-0 mt-0.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold relative z-10"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(59,130,246,0.2))', border: '1px solid rgba(124,58,237,0.45)' }}
                >
                  <span className="gradient-text font-display text-sm font-700">1</span>
                </div>
              </div>
              <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2">
                    {/* Page / flag icon */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-violet-400 shrink-0" aria-hidden="true">
                      <path d="M3 2v12M3 2h8l-2 3.5L11 9H3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="font-semibold text-sm text-white">Create a Facebook Page for your artist</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Meta requires a <span className="text-gray-300">Facebook Page</span> — not a personal profile — to run ads.
                  Think of it as your artist&apos;s official account. If you already have one, skip this.
                </p>
                <a
                  href="https://www.facebook.com/pages/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Create a Page
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <path d="M2.5 8.5l6-6M8.5 8.5V2.5H2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* ── Step 2 ─────────────────────────────────────────────── */}
            <div className="step-2 flex gap-4 mb-5">
              <div className="shrink-0 mt-0.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center relative z-10"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(59,130,246,0.2))', border: '1px solid rgba(124,58,237,0.45)' }}
                >
                  <span className="gradient-text font-display text-sm font-700">2</span>
                </div>
              </div>
              <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-2 mb-1.5">
                  {/* Building / briefcase icon */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-violet-400 shrink-0" aria-hidden="true">
                    <rect x="2" y="6" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M5 6V4.5A1.5 1.5 0 0 1 6.5 3h3A1.5 1.5 0 0 1 11 4.5V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <path d="M2 9.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <p className="font-semibold text-sm text-white">Open Meta Business Manager</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Business Manager is where your ad accounts and billing live — it&apos;s separate from your personal Facebook.
                  Sign in with the same Facebook account.
                </p>
                <a
                  href="https://business.facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Open Business Manager
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <path d="M2.5 8.5l6-6M8.5 8.5V2.5H2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* ── Step 3 ─────────────────────────────────────────────── */}
            <div className="step-3 flex gap-4 mb-5">
              <div className="shrink-0 mt-0.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center relative z-10"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(59,130,246,0.2))', border: '1px solid rgba(124,58,237,0.45)' }}
                >
                  <span className="gradient-text font-display text-sm font-700">3</span>
                </div>
              </div>
              <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-2 mb-1.5">
                  {/* Credit card icon */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-violet-400 shrink-0" aria-hidden="true">
                    <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M4.5 10h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <p className="font-semibold text-sm text-white">Create an Ad Account and add payment</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Inside Business Manager, create an Ad Account and add a card or PayPal.
                  You won&apos;t be charged until your campaign goes live.
                </p>
                {/* Breadcrumb path */}
                <div className="flex items-center gap-1 flex-wrap">
                  {['Accounts', 'Ad Accounts', 'Add New Ad Account'].map((item, i, arr) => (
                    <span key={item} className="flex items-center gap-1">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">
                        {item}
                      </span>
                      {i < arr.length - 1 && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-600 shrink-0" aria-hidden="true">
                          <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Step 4 — action step ───────────────────────────────── */}
            <div className="step-4 flex gap-4">
              <div className="shrink-0 mt-0.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center relative z-10"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(59,130,246,0.4))', border: '1px solid rgba(139,92,246,0.7)', boxShadow: '0 0 12px rgba(124,58,237,0.3)' }}
                >
                  <span className="text-white font-display text-sm font-700">4</span>
                </div>
              </div>
              <div
                className="flex-1 rounded-xl p-5"
                style={{
                  border: '1px solid rgba(124,58,237,0.5)',
                  background: 'linear-gradient(145deg, rgba(109,40,217,0.12) 0%, rgba(59,130,246,0.06) 100%)',
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {/* Plug / link icon */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-violet-300 shrink-0" aria-hidden="true">
                    <path d="M6 10l-1.5 1.5a2.121 2.121 0 0 1-3-3L3 7M10 6l1.5-1.5a2.121 2.121 0 0 1 3 3L13 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <path d="M6.5 9.5l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <p className="font-semibold text-sm text-white">Connect your account here</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                  Once you&apos;re set up, hit the button below. You&apos;ll be redirected to Facebook to grant
                  permission — we only request the minimum access needed to run your ads.
                </p>
                <a href="/api/auth/meta" className="btn-primary block w-full py-2.5 text-sm text-center">
                  Connect Meta Account →
                </a>
              </div>
            </div>

          </div>

          {/* Already have everything? */}
          <p className="header-in text-center text-xs text-gray-600 mt-8">
            Already have an Ad Account?{' '}
            <a href="/api/auth/meta" className="text-gray-400 hover:text-gray-200 transition-colors underline underline-offset-2">
              Skip straight to connecting →
            </a>
          </p>

        </div>
      </>
    );
  }

  return <CampaignNewForm />;
}
