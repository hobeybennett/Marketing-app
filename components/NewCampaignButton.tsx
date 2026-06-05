'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCampaignButton({ needsPayment }: { needsPayment: boolean }) {
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
      <button
        onClick={handleClick}
        className="btn-primary px-4 py-2 text-sm"
      >
        New Campaign
      </button>

      {showPaywall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full text-center">
            <h2 className="font-display text-xl font-700 mb-2">Unlock Another Campaign</h2>
            <p className="text-sm text-gray-400 mb-5">
              Each additional campaign is a one-time payment of $4.99.
            </p>
            <a
              href="/api/checkout"
              className="btn-primary block w-full px-6 py-3 text-lg mb-3"
            >
              Get Campaign Credit — $4.99
            </a>
            <button
              type="button"
              onClick={() => setShowPaywall(false)}
              className="text-sm text-gray-500 hover:text-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
