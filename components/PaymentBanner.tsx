'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PaymentBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const payment = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (payment === 'pro_success' && sessionId) {
      // Verify subscription in DB (fallback if webhook didn't fire), then go straight to new campaign
      fetch('/api/checkout/verify-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).finally(() => {
        router.push('/campaigns/new');
      });
    } else if (payment === 'success' && sessionId) {
      // Credit the account (fallback if webhook didn't fire), then go straight to new campaign
      fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).finally(() => {
        router.push('/campaigns/new');
      });
    }
  }, [payment, sessionId, router]);

  if (payment === 'cancelled') {
    return (
      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-gray-300">
        Payment cancelled — no charge was made.
      </div>
    );
  }

  if (payment === 'success' || payment === 'pro_success') {
    return (
      <div className="mb-6 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-3 text-sm text-violet-200">
        Payment confirmed — taking you to your new campaign…
      </div>
    );
  }

  return null;
}
