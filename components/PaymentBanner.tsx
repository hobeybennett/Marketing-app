'use client';

import { useSearchParams } from 'next/navigation';

export default function PaymentBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get('payment') !== 'success') return null;

  return (
    <div className="mb-6 rounded-xl border border-violet-700/50 bg-violet-900/20 px-4 py-3 text-sm text-violet-200">
      Payment successful — your campaign credit has been added. Click <strong>New Campaign</strong> to get started.
    </div>
  );
}
