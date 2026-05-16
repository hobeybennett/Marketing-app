'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  connection: {
    adAccountName: string | null;
    pageName: string | null;
    tokenExpiresAt: Date | null;
  } | null;
};

export default function MetaConnectSection({ connection }: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    await fetch('/api/auth/meta/disconnect', { method: 'POST' });
    router.refresh();
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">Meta Ads</h2>
          <p className="text-xs text-gray-500 mt-0.5">Required to run campaigns</p>
        </div>
        {connection ? (
          <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2.5 py-1 rounded-full">
            Connected
          </span>
        ) : (
          <span className="text-xs bg-gray-800 text-gray-500 border border-gray-700 px-2.5 py-1 rounded-full">
            Not connected
          </span>
        )}
      </div>

      {connection ? (
        <div className="space-y-2 text-sm text-gray-300">
          <p><span className="text-gray-500">Ad Account: </span>{connection.adAccountName ?? '—'}</p>
          <p><span className="text-gray-500">Page: </span>{connection.pageName ?? '—'}</p>
          {connection.tokenExpiresAt && (
            <p className="text-xs text-gray-500">
              Token expires {new Date(connection.tokenExpiresAt).toLocaleDateString()}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <a href="/api/auth/meta"
              className="flex-1 text-center py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 transition">
              Reconnect
            </a>
            <button onClick={disconnect} disabled={disconnecting}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 transition disabled:opacity-50">
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <a href="/api/auth/meta"
          className="block w-full text-center py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 transition">
          Connect Meta Account
        </a>
      )}
    </div>
  );
}
