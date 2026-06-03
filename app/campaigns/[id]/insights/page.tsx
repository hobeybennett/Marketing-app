'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AdInsight {
  id: string;
  metaAdSetId: string | null;
  metaAdId: string | null;
  date: string;
  spend: number;
  impressions: number;
  ctr: number;
  cpm: number;
  cpc: number;
  outboundClicks: number;
}

interface Summary {
  totalSpend: number;
  totalImpressions: number;
  avgCtr: number;
  avgCpm: number;
  avgCpc: number;
  totalOutboundClicks: number;
}

interface AdSetSummary {
  metaAdSetId: string;
  totalSpend: number;
  totalImpressions: number;
  avgCtr: number;
}

interface Audience {
  id: string;
  name: string;
  type: string;
  metaAdSetId: string | null;
  dataStatus: string | null;
  availabilityNote: string | null;
}

interface OptimisationLog {
  id: string;
  metaAdSetId: string | null;
  action: string;
  reason: string;
  previousValue: number | null;
  newValue: number | null;
  createdAt: string;
}

interface InsightsData {
  insights: AdInsight[];
  lastSyncAt: string | null;
  summary: Summary;
  bestAdSet: AdSetSummary | null;
  worstAdSet: AdSetSummary | null;
}

interface FatigueData {
  triggered: boolean;
  reason: string;
}

function formatCurrency(n: number) {
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number) {
  return `${n.toFixed(2)}%`;
}

function timeSince(dateStr: string | null) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InsightsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<InsightsData | null>(null);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [optimisationLogs, setOptimisationLogs] = useState<OptimisationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fatigueResult, setFatigueResult] = useState<FatigueData | null>(null);

  const fetchData = useCallback(async () => {
    const [insightsRes, audiencesRes, logsRes] = await Promise.all([
      fetch(`/api/campaigns/${params.id}/insights`, { cache: 'no-store' }),
      fetch(`/api/campaigns/${params.id}/audiences`, { cache: 'no-store' }),
      fetch(`/api/campaigns/${params.id}/optimisation-logs`, { cache: 'no-store' }),
    ]);

    if (insightsRes.ok) setData(await insightsRes.json());
    if (audiencesRes.ok) setAudiences(await audiencesRes.json());
    if (logsRes.ok) setOptimisationLogs(await logsRes.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSyncNow() {
    setSyncing(true);
    await fetch(`/api/campaigns/${params.id}/sync`, { method: 'POST' });
    await fetchData();
    setSyncing(false);
  }

  async function handleRefreshCreatives() {
    setRefreshing(true);
    const res = await fetch(`/api/campaigns/${params.id}/refresh`, { method: 'POST' });
    if (res.ok) {
      const result = await res.json();
      setFatigueResult(result);
      if (result.triggered) router.push(`/campaigns/${params.id}`);
    }
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-gray-400">
        Loading performance data…
      </div>
    );
  }

  // Build adset table from insights
  const adSetMap = new Map<string, { metaAdSetId: string; name: string; totalSpend: number; totalImpressions: number; ctrSum: number; cpcSum: number; outboundClicks: number; count: number }>();
  for (const row of (data?.insights ?? []).filter(r => r.metaAdSetId)) {
    const key = row.metaAdSetId!;
    const existing = adSetMap.get(key) ?? { metaAdSetId: key, name: key, totalSpend: 0, totalImpressions: 0, ctrSum: 0, cpcSum: 0, outboundClicks: 0, count: 0 };
    existing.totalSpend += row.spend;
    existing.totalImpressions += row.impressions;
    existing.ctrSum += row.ctr;
    existing.cpcSum += row.cpc;
    existing.outboundClicks += row.outboundClicks;
    existing.count += 1;
    adSetMap.set(key, existing);
  }

  const adSetRows = Array.from(adSetMap.values())
    .map(as => ({
      ...as,
      avgCtr: as.count > 0 ? as.ctrSum / as.count : 0,
      avgCpc: as.count > 0 ? as.cpcSum / as.count : 0,
    }))
    .sort((a, b) => b.avgCtr - a.avgCtr);

  const bestAdSetId = data?.bestAdSet?.metaAdSetId;

  // Find audience by metaAdSetId for display
  const getAudienceName = (metaAdSetId: string) => {
    const aud = audiences.find(a => a.metaAdSetId === metaAdSetId);
    return aud?.name ?? metaAdSetId;
  };

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-4">
        <Link href={`/campaigns/${params.id}`} className="text-gray-400 hover:text-white text-sm">
          ← Back to Campaign
        </Link>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>Last synced: {timeSince(data?.lastSyncAt ?? null)}</span>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 px-3 py-1.5 rounded-lg text-xs transition"
          >
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-6">Performance</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard label="Total Spend" value={formatCurrency(data?.summary.totalSpend ?? 0)} />
        <MetricCard label="Impressions" value={(data?.summary.totalImpressions ?? 0).toLocaleString()} />
        <MetricCard label="Avg CTR" value={formatPct(data?.summary.avgCtr ?? 0)} />
        <MetricCard label="Avg CPM" value={formatCurrency(data?.summary.avgCpm ?? 0)} />
        <MetricCard label="Avg CPC" value={formatCurrency(data?.summary.avgCpc ?? 0)} />
        <MetricCard label="Outbound Clicks" value={(data?.summary.totalOutboundClicks ?? 0).toLocaleString()} />
      </div>

      {/* Best performing */}
      {data?.bestAdSet && (
        <div className="bg-green-900/20 border border-green-700 rounded-xl p-4 mb-6">
          <p className="text-xs text-green-400 font-medium mb-1">Best Performing</p>
          <p className="font-semibold">{getAudienceName(data.bestAdSet.metaAdSetId)}</p>
          <p className="text-sm text-gray-400 mt-1">
            CTR {formatPct(data.bestAdSet.avgCtr)} · Spend {formatCurrency(data.bestAdSet.totalSpend)} · {data.bestAdSet.totalImpressions.toLocaleString()} impressions
          </p>
        </div>
      )}

      {/* Ad set table */}
      {adSetRows.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-800">
            <h3 className="font-semibold">Ad Sets</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-left px-5 py-2">Audience</th>
                  <th className="text-right px-3 py-2">Spend</th>
                  <th className="text-right px-3 py-2">Impr.</th>
                  <th className="text-right px-3 py-2">CTR</th>
                  <th className="text-right px-3 py-2">CPC</th>
                  <th className="text-right px-5 py-2">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {adSetRows.map(row => (
                  <tr key={row.metaAdSetId} className="border-b border-gray-800 last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-medium">{getAudienceName(row.metaAdSetId)}</span>
                      {row.metaAdSetId === bestAdSetId && (
                        <span className="ml-2 text-xs text-green-400">★ best</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-3 tabular-nums">{formatCurrency(row.totalSpend)}</td>
                    <td className="text-right px-3 py-3 tabular-nums">{row.totalImpressions.toLocaleString()}</td>
                    <td className="text-right px-3 py-3 tabular-nums text-blue-400">{formatPct(row.avgCtr)}</td>
                    <td className="text-right px-3 py-3 tabular-nums">{formatCurrency(row.avgCpc)}</td>
                    <td className="text-right px-5 py-3 tabular-nums">{row.outboundClicks.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adSetRows.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 mb-6">
          <p>No performance data yet.</p>
          <p className="text-xs mt-1">Data appears once your campaign is live and synced.</p>
        </div>
      )}

      {/* Audience availability */}
      {audiences.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-3">Audiences</h3>
          <div className="space-y-2">
            {audiences.map(aud => (
              <div key={aud.id} className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{aud.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    aud.dataStatus === 'AVAILABLE' ? 'bg-green-900/40 text-green-400' :
                    aud.dataStatus === 'PENDING_DATA' ? 'bg-yellow-900/40 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {aud.dataStatus ?? aud.type}
                  </span>
                </div>
                {aud.availabilityNote && (
                  <p className="text-xs text-gray-500 mt-1">{aud.availabilityNote}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimisation actions */}
      {optimisationLogs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h3 className="font-semibold mb-3">Optimisation Actions</h3>
          <div className="space-y-2">
            {optimisationLogs.map(log => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <span className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${
                  log.action === 'FLAG_WINNER' || log.action === 'SCALE_BUDGET' ? 'bg-green-900/40 text-green-400' :
                  log.action === 'FLAG_LOSER' || log.action === 'PAUSE_ADSET' ? 'bg-red-900/40 text-red-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {log.action.replace(/_/g, ' ')}
                </span>
                <div>
                  <p className="text-gray-300">{log.reason}</p>
                  {log.previousValue !== null && log.newValue !== null && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {log.previousValue} → {log.newValue}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creative Refresh */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="font-semibold mb-1">Creative Refresh</h3>
        {fatigueResult === null ? (
          <>
            <p className="text-sm text-gray-400 mb-3">
              Detect if your creatives are suffering from ad fatigue and regenerate them automatically.
            </p>
            <button
              type="button"
              onClick={handleRefreshCreatives}
              disabled={refreshing}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              {refreshing ? 'Checking…' : 'Check for Fatigue'}
            </button>
          </>
        ) : fatigueResult.triggered ? (
          <div className="text-yellow-400">
            <p className="font-medium">Fatigue detected — regenerating creatives…</p>
            <p className="text-sm text-gray-400 mt-1">{fatigueResult.reason}</p>
          </div>
        ) : (
          <div className="text-green-400">
            <p className="font-medium">No fatigue detected</p>
            <p className="text-sm text-gray-400 mt-1">{fatigueResult.reason}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
