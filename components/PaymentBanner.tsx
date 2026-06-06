'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PaymentBanner() {
  const searchParams = useSearchParams();
  const payment = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (payment !== 'success' || !sessionId) return;
    // Fallback: verify payment and credit in case the Stripe webhook didn't fire
    fetch('/api/checkout/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).then(() => setVerified(true)).catch(() => setVerified(true));
  }, [payment, sessionId]);

  if (payment !== 'success') return null;

  return (
    <div className="mb-6 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-3 text-sm text-violet-200">
      Payment successful — your campaign credit has been added. Click <strong>New Campaign</strong> to get started.
    </div>
  );
}
