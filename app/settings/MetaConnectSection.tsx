'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type AdAccountOption = { id: string; name: string; businessId: string | null; businessName: string | null };
type PageOption = { id: string; name: string; accessToken: string | null };

type Props = {
  connection: {
    adAccountId: string;
    adAccountName: string | null;
    pageId: string;
    pageName: string | null;
    tokenExpiresAt: Date | null;
    pixelId: string | null;
    pixelName: string | null;
    availableAdAccounts: AdAccountOption[] | null;
    availablePages: PageOption[] | null;
  } | null;
};

export default function MetaConnectSection({ connection }: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const [editingPixel, setEditingPixel] = useState(false);
  const [pixelInput, setPixelInput] = useState('');
  const [savingPixel, setSavingPixel] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [selectedAccountId, setSelectedAccountId] = useState(connection?.adAccountId ?? '');
  const [selectedPageId, setSelectedPageId] = useState(connection?.pageId ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const accounts = connection?.availableAdAccounts ?? [];
  const pages = connection?.availablePages ?? [];

  const hasAccountChoice = accounts.length > 1;
  const hasPageChoice = pages.length > 1;
  const selectionChanged =
    selectedAccountId !== connection?.adAccountId ||
    selectedPageId !== connection?.pageId;

  async function saveSelection() {
    setSaving(true);
    await fetch('/api/auth/meta/connection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(selectedAccountId !== connection?.adAccountId ? { adAccountId: selectedAccountId } : {}),
        ...(selectedPageId !== connection?.pageId ? { pageId: selectedPageId } : {}),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function disconnect() {
    setDisconnecting(true);
    await fetch('/api/auth/meta/disconnect', { method: 'POST' });
    router.refresh();
  }

  async function savePixel() {
    setSavingPixel(true);
    await fetch('/api/settings/pixel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pixelId: pixelInput }),
    });
    setSavingPixel(false);
    setEditingPixel(false);
    router.refresh();
  }

  async function setupTracking() {
    setSettingUp(true);
    const res = await fetch('/api/settings/pixel', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setSetupError(data?.error ?? 'Could not set up tracking — try Reconnect.');
    }
    setSettingUp(false);
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
        <div className="space-y-3 text-sm text-gray-300">
          {/* Ad Account */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Ad Account</p>
            {hasAccountChoice ? (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.businessName ? ` · ${a.businessName}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-gray-200">{connection.adAccountName ?? connection.adAccountId}</p>
            )}
          </div>

          {/* Facebook Page */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Facebook Page</p>
            {hasPageChoice ? (
              <select
                value={selectedPageId}
                onChange={(e) => setSelectedPageId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-gray-200">{connection.pageName ?? connection.pageId}</p>
            )}
          </div>

          {/* Save selection button — only visible when something changed */}
          {selectionChanged && (
            <button
              onClick={saveSelection}
              disabled={saving}
              className="w-full py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save selection'}
            </button>
          )}
          {saved && !selectionChanged && (
            <p className="text-xs text-green-400">Saved</p>
          )}

          {connection.tokenExpiresAt && (
            <p className="text-xs text-gray-500">
              Token expires {new Date(connection.tokenExpiresAt).toLocaleDateString()}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <a href="/api/auth/meta"
              className="btn-primary flex-1 py-2 text-xs">
              Reconnect
            </a>
            <button onClick={disconnect} disabled={disconnecting}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 transition disabled:opacity-50">
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>

          {/* Conversion tracking (Meta Pixel) */}
          <div className="pt-4 border-t border-gray-800 mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-200">Conversion tracking</p>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                connection.pixelId
                  ? 'bg-green-900/40 text-green-400 border-green-800'
                  : 'bg-gray-800 text-gray-500 border-gray-700'
              }`}>
                {connection.pixelId ? 'On' : 'Off'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Tracks who clicks through to Spotify, so your ads learn to reach more real listeners.
            </p>

            {editingPixel ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pixelInput}
                  onChange={(e) => setPixelInput(e.target.value)}
                  placeholder="Enter Pixel ID"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button onClick={savePixel} disabled={savingPixel}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50">
                  {savingPixel ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditingPixel(false)}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white transition">
                  Cancel
                </button>
              </div>
            ) : connection.pixelId ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Pixel <span className="font-mono text-gray-400">{connection.pixelId}</span>
                  {connection.pixelName ? ` · ${connection.pixelName}` : ''}
                </p>
                <button onClick={() => { setPixelInput(connection.pixelId ?? ''); setEditingPixel(true); }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition">
                  Use my own
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <button onClick={setupTracking} disabled={settingUp}
                    className="btn-primary flex-1 py-2 text-xs disabled:opacity-50">
                    {settingUp ? 'Setting up…' : 'Set up conversion tracking'}
                  </button>
                  <button onClick={() => { setPixelInput(''); setEditingPixel(true); }}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white transition">
                    Use my own
                  </button>
                </div>
                {setupError && <p className="text-xs text-red-400 mt-2">{setupError}</p>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <a href="/connect-meta"
            className="btn-primary block w-full py-2.5 text-sm text-center">
            Connect Meta Account
          </a>
          <a href="/api/auth/meta"
            className="block w-full py-2 text-xs text-center text-gray-500 hover:text-gray-300 transition">
            Already set up? Connect directly
          </a>
        </div>
      )}
    </div>
  );
}
