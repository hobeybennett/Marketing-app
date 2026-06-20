'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SubscriptionSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/subscription/sync', { method: 'POST' });
      const data = await res.json();
      if (data.status) {
        setResult(`Synced — status: ${data.status}`);
        router.refresh();
      } else {
        setResult(data.message ?? 'No subscription found');
      }
    } catch {
      setResult('Sync failed — check your connection');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={sync}
        disabled={loading}
        className="text-xs text-gray-500 hover:text-gray-300 transition disabled:opacity-50"
      >
        {loading ? 'Syncing…' : 'Sync subscription status from Stripe'}
      </button>
      {result && <p className="text-xs text-gray-400 mt-1">{result}</p>}
    </div>
  );
}
