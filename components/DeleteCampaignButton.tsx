'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteCampaignButton({
  campaignId,
  redirect = false,
}: {
  campaignId: string;
  redirect?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
    if (res.ok) {
      if (redirect) {
        router.push('/campaigns');
      } else {
        router.refresh();
      }
    } else {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-gray-400">Delete?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 px-2 py-1 rounded-md transition"
        >
          {loading ? '…' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-400 hover:text-white transition"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); e.preventDefault(); setConfirming(true); }}
      className="text-gray-600 hover:text-red-400 transition p-1 rounded"
      title="Delete campaign"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );
}
