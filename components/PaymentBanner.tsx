'use client';

import { useSearchParams } from 'next/navigation';

export default function PaymentBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get('payment') !== 'success') return null;

  return (
    <div className="mb-6 rounded-xl border border-green-700 bg-green-900/20 px-4 py-3 text-sm text-green-300">
      Payment successful — your campaign credit has been added. Click <strong>New Campaign</strong> to get started.
    </div>
  );
}
