'use client';

import { useState } from 'react';

export default function ResetButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleReset() {
    if (!confirm('Delete ALL your campaigns and drain the entire job queue? This cannot be undone.')) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Error: ${JSON.stringify(data)}`);
      } else {
        setResult(`Deleted ${data.campaignsDeleted} campaigns, drained ${data.drainedJobs} jobs.`);
      }
    } catch (err) {
      setResult(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 bg-red-900/10 border border-red-900/40 rounded-xl p-4">
      <h3 className="font-semibold text-sm text-red-300 mb-1">Danger Zone</h3>
      <p className="text-xs text-gray-400 mb-3">
        Nuke all your campaigns and drain the Redis job queue. Use when stuck jobs have piled up.
      </p>
      <button
        onClick={handleReset}
        disabled={loading}
        className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        {loading ? 'Resetting…' : 'Reset campaigns + queue'}
      </button>
      {result && (
        <p className="mt-3 text-sm text-gray-300 font-mono">{result}</p>
      )}
    </div>
  );
}
