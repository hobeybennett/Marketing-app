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
        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition"
      >
        New Campaign
      </button>

      {showPaywall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full text-center">
            <h2 className="text-xl font-bold mb-2">Unlock Another Campaign</h2>
            <p className="text-sm text-gray-400 mb-5">
              Each additional campaign is a one-time payment of $4.99.
            </p>
            <a
              href="/api/checkout"
              className="block w-full bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold text-lg transition mb-3"
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
