'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PaymentBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const payment = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');
  const [proActivated, setProActivated] = useState(false);

  useEffect(() => {
    if (payment === 'pro_success' && sessionId) {
      // Fallback: activate subscription in DB in case the Stripe webhook didn't fire
      fetch('/api/checkout/verify-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
        .then(() => {
          setProActivated(true);
          // Refresh so the server-rendered page re-reads subscriptionStatus from DB
          router.refresh();
        })
        .catch(() => setProActivated(true));
    } else if (payment === 'success' && sessionId) {
      // Fallback: credit single campaign in case the Stripe webhook didn't fire
      fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
  }, [payment, sessionId, router]);

  if (payment === 'pro_success') {
    return (
      <div className="mb-6 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-3 text-sm text-violet-200">
        Welcome to Promohit Pro — unlimited campaigns activated. Click <strong>New Campaign</strong> to get started.
      </div>
    );
  }

  if (payment === 'success') {
    return (
      <div className="mb-6 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-3 text-sm text-violet-200">
        Payment successful — your campaign credit has been added. Click <strong>New Campaign</strong> to get started.
      </div>
    );
  }

  return null;
}
