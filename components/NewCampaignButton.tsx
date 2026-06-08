'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCampaignButton({
  needsPayment,
  isPro = false,
  credits = 0,
}: {
  needsPayment: boolean;
  isPro?: boolean;
  credits?: number;
}) {
  const router = useRouter();
  const [showPaywall, setShowPaywall] = useState(false);

  function handleClick() {
    if (needsPayment) {
      setShowPaywall(true);
    } else {
      router.push('/campaigns/new');
    }
  }

  return (
    <>
      <button onClick={handleClick} className="btn-primary px-4 py-2 text-sm">
        New Campaign
      </button>

      {showPaywall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full">
            <h2 className="font-display text-xl font-700 mb-1 text-center">Get more campaigns</h2>
            <p className="text-sm text-gray-400 mb-6 text-center">
              {credits > 0
                ? `You have ${credits} credit${credits !== 1 ? 's' : ''} remaining.`
                : "You've used your free campaign."}
            </p>

            {/* Pro option */}
            <a href="/api/checkout/pro"
              className="block w-full mb-3 rounded-xl border border-violet-600 bg-violet-900/30 hover:bg-violet-900/50 transition p-4 text-center group">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-widest text-violet-400">Most popular</span>
              </div>
              <p className="font-display font-700 text-lg text-white">Promohit Pro</p>
              <p className="text-2xl font-bold text-violet-300 my-1">$9.99<span className="text-sm font-normal text-gray-400">/month</span></p>
              <p className="text-sm text-gray-400">Unlimited campaigns, cancel anytime</p>
            </a>

            {/* Single credit option */}
            <a href="/api/checkout"
              className="block w-full mb-4 rounded-xl border border-gray-700 bg-gray-800/50 hover:bg-gray-800 transition p-4 text-center">
              <p className="font-semibold text-white">Single Campaign Credit</p>
              <p className="text-xl font-bold text-gray-200 my-1">$5.00</p>
              <p className="text-sm text-gray-500">One campaign, no subscription</p>
            </a>

            <button type="button" onClick={() => setShowPaywall(false)}
              className="w-full text-sm text-gray-500 hover:text-gray-300 transition text-center">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
