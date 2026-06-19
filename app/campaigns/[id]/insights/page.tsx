'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Totals {
  spend: number;
  impressions: number;
  videoViews: number;
  outboundClicks: number;
  avgCtr: number;
  avgCpc: number;
  costPerConversion: number | null;
}

interface Budget {
  daily: number | null;
  todaySpend: number;
  remaining: number | null;
}

interface DailyRow {
  date: string;
  spend: number;
  impressions: number;
  ctr: number;
}

interface AdsetBreakdownRow {
  metaAdSetId: string;
  audienceName: string | null;
  audienceType: string | null;
  spend: number;
  impressions: number;
  avgCtr: number;
}

interface SmartLinkClicks {
  total: number;
  byPlatform: Record<string, number>;
}

interface CreativeStat {
  id: string;
  index: number;
  metaAdId: string | null;
  fileUrl: string;
  ctaText: string;
  adStatus: string;
  startSec: number | null;
  endSec: number | null;
  totalSpend: number;
  totalImpressions: number;
  totalVideoViews: number;
  totalOutboundClicks: number;
  avgCtr: number;
  hasData: boolean;
}

interface InsightsPayload {
  totals: Totals;
  budget: Budget;
  daily: DailyRow[];
  adsetBreakdown: AdsetBreakdownRow[];
  smartLinkClicks: SmartLinkClicks;
  lastSyncAt: string | null;
  creativeStats: CreativeStat[];
}

interface CampaignBasic {
  id: string;
  songTitle: string;
  artistName: string;
  status: string;
  metaCampaignId: string | null;
}

function timeSince(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString(); }

function videoApiUrl(fileUrl: string): string {
  const filename = fileUrl.split('/').pop() ?? '';
  const parts = fileUrl.split('/');
  const videosIdx = parts.indexOf('videos');
  const campaignId = videosIdx > 0 ? parts[videosIdx - 1] : '';
  return `/api/videos/${campaignId}/${filename}`;
}

function thumbApiUrl(fileUrl: string): string {
  const filename = (fileUrl.split('/').pop() ?? '').replace('.mp4', '_thumb.jpg');
  const parts = fileUrl.split('/');
  const videosIdx = parts.indexOf('videos');
  const campaignId = videosIdx > 0 ? parts[videosIdx - 1] : '';
  return `/api/videos/${campaignId}/thumb/${filename}`;
}

export default function InsightsPage({ params }: { params: { id: string } }) {
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [campaign, setCampaign] = useState<CampaignBasic | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    const [iRes, cRes] = await Promise.all([
      fetch(`/api/campaigns/${params.id}/insights`, { cache: 'no-store' }),
      fetch(`/api/campaigns/${params.id}`, { cache: 'no-store' }),
    ]);
    if (iRes.ok) setInsights(await iRes.json());
    if (cRes.ok) {
      const c = await cRes.json();
      setCampaign({ id: c.id, songTitle: c.songTitle, artistName: c.artistName, status: c.status, metaCampaignId: c.metaCampaignId ?? null });
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    // Load cached data immediately, then auto-sync in background
    fetchAll().then(() => handleSync());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/campaigns/${params.id}/insights`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncError((body as { error?: string }).error ?? 'Sync failed');
      } else {
        await fetchAll();
      }
    } catch {
      setSyncError('Network error — could not reach the server.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggle(creativeId: string, currentStatus: string) {
    setTogglingId(creativeId);
    setToggleError('');
    const action = currentStatus === 'ACTIVE' ? 'pause' : 'resume';
    const res = await fetch(`/api/campaigns/${params.id}/creatives/${creativeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setToggleError((err as { error?: string }).error || 'Failed to update ad status');
    } else {
      await fetchAll();
    }
    setTogglingId(null);
  }

  async function handleCampaignAction(action: string) {
    setActionLoading(true);
    await fetch(`/api/campaigns/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await fetchAll();
    setActionLoading(false);
  }

  if (loading) return <div className="text-gray-400 text-center py-20">Loading…</div>;

  const totals = insights?.totals ?? { spend: 0, impressions: 0, videoViews: 0, outboundClicks: 0, avgCtr: 0, avgCpc: 0, costPerConversion: null };
  const budget = insights?.budget ?? { daily: null, todaySpend: 0, remaining: null };
  const daily = insights?.daily ?? [];
  const adsetBreakdown = insights?.adsetBreakdown ?? [];
  const smartLink = insights?.smartLinkClicks ?? { total: 0, byPlatform: {} };
  const lastSyncAt = insights?.lastSyncAt ?? null;
  const creativeStats = insights?.creativeStats ?? [];
  const sortedCreatives = [...creativeStats].sort((a, b) => b.avgCtr - a.avgCtr);
  const maxSpend = daily.length > 0 ? Math.max(...daily.map(d => d.spend), 0.001) : 0.001;
  const platformEntries = Object.entries(smartLink.byPlatform).sort((a, b) => b[1] - a[1]);
  const hasData = totals.spend > 0 || totals.impressions > 0 || smartLink.total > 0;

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-2">
        <Link href="/campaigns" className="text-gray-400 hover:text-white text-sm transition">
          Campaigns
        </Link>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {/* Title + controls */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-700">
              {campaign ? (
                <><span className="gradient-text">{campaign.songTitle}</span><br />
                <span className="text-gray-400 text-base font-400">{campaign.artistName}</span></>
              ) : 'Campaign Performance'}
            </h1>
            {lastSyncAt
              ? <p className="text-xs text-gray-500 mt-1">Synced {timeSince(lastSyncAt)}</p>
              : <p className="text-xs text-gray-500 mt-1">Syncing…</p>
            }
          </div>

          {/* Pause / Resume */}
          <div className="shrink-0 mt-1">
            {campaign?.status === 'LIVE' && (
              <button
                onClick={() => handleCampaignAction('pause')}
                disabled={actionLoading}
                className="text-sm border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-4 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {actionLoading ? '…' : 'Pause'}
              </button>
            )}
            {campaign?.status === 'PAUSED' && (
              <button
                onClick={() => handleCampaignAction('resume')}
                disabled={actionLoading}
                className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {actionLoading ? '…' : 'Resume'}
              </button>
            )}
          </div>
        </div>

        {/* Status badge */}
        {campaign?.status === 'PAUSED' && (
          <span className="inline-block mt-2 text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2.5 py-1 rounded-full">
            Paused — ads not delivering
          </span>
        )}
      </div>

      {/* Smart link (shown for live/paused campaigns) */}
      {(campaign?.status === 'LIVE' || campaign?.status === 'PAUSED') && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Smart link</p>
            <code className="text-xs text-green-400 truncate block">/go/{params.id}</code>
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/go/${params.id}`)}
            className="text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition shrink-0"
          >
            Copy
          </button>
        </div>
      )}

      {syncError && (
        <div className="mb-4 border border-red-700 bg-red-900/20 rounded-xl px-4 py-3 text-sm text-red-300">
          {syncError}
        </div>
      )}

      {/* ── Core stats — always visible ───────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <BigStat label="Spent" value={fmt$(totals.spend)} sub={hasData ? undefined : 'No data yet'} gradient />
          <BigStat label="Video Views" value={fmtK(totals.videoViews)} />
          <BigStat label="Conversions" value={fmtK(smartLink.total)} sub="platform clicks" />
          <BigStat
            label="Cost / Conv."
            value={totals.costPerConversion != null ? fmt$(totals.costPerConversion) : '—'}
          />
        </div>

        {/* Top creative */}
        {(() => {
          const top = sortedCreatives.find(c => c.hasData);
          return top ? (
            <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between text-xs">
              <span className="text-gray-500">Top creative</span>
              <span className="font-medium text-violet-300">
                Clip {top.index + 1} &mdash; {top.avgCtr.toFixed(2)}% CTR · {fmtK(top.totalOutboundClicks)} clicks
              </span>
            </div>
          ) : null;
        })()}

        {/* Budget row */}
        {budget.daily != null ? (
          <div className="mt-4 pt-4 border-t border-gray-800 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Daily Budget</p>
              <p className="text-sm font-600">{fmt$(budget.daily)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Spent Today</p>
              <p className="text-sm font-600">{fmt$(budget.todaySpend)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Remaining</p>
              <p className={`text-sm font-600 ${(budget.remaining ?? 0) < budget.daily * 0.2 ? 'text-amber-400' : 'text-green-400'}`}>
                {fmt$(budget.remaining ?? 0)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-600 text-center">
            Budget data loads after your first sync
          </p>
        )}
      </div>

      {/* ── Secondary stats ───────────────────────────────────────────────── */}
      {hasData && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <MiniStat label="Impressions" value={fmtK(totals.impressions)} />
          <MiniStat label="Avg CTR" value={`${totals.avgCtr.toFixed(2)}%`} />
          <MiniStat label="Avg CPC" value={totals.avgCpc > 0 ? fmt$(totals.avgCpc) : '—'} />
        </div>
      )}

      {/* ── Creative Performance ──────────────────────────────────────────── */}
      {creativeStats.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <h3 className="font-display font-700 text-base mb-3">Creative Performance</h3>
          {toggleError && (
            <div className="mb-3 border border-red-700 bg-red-900/20 rounded-lg px-3 py-2 text-sm text-red-300">
              {toggleError}
            </div>
          )}
          <div className="space-y-3">
            {sortedCreatives.map((creative, sortIdx) => (
              <CreativeCard
                key={creative.id}
                creative={creative}
                isTop={sortIdx === 0 && creative.hasData}
                togglingId={togglingId}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </div>
      )}

      {hasData && (
        <>
          {/* Smart Link */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-700 text-base">Smart Link</h2>
              <span className="gradient-text text-2xl font-700 tabular-nums">{smartLink.total.toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Platform clicks from your smart link</p>
            {platformEntries.length > 0 ? (
              <div className="space-y-2">
                {platformEntries.map(([platform, count]) => {
                  const pct = smartLink.total > 0 ? (count / smartLink.total) * 100 : 0;
                  return (
                    <div key={platform}>
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span className="capitalize">{platform}</span>
                        <span>{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1 rounded-full bg-gray-800">
                        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #7c3aed, #3b82f6)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No platform data yet.</p>
            )}
          </div>

          {/* Daily spend chart */}
          {daily.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
              <h2 className="font-display font-700 text-base mb-4">Daily Spend</h2>
              <div className="flex items-end gap-1 h-24">
                {daily.map((d, i) => {
                  const heightPct = maxSpend > 0 ? (d.spend / maxSpend) * 100 : 0;
                  return (
                    <div key={i} className="relative flex-1 group flex flex-col justify-end h-full">
                      <div className="rounded-t w-full" style={{ height: `${Math.max(heightPct, 2)}%`, background: 'linear-gradient(180deg, #7c3aed, #3b82f6)' }} />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap bg-gray-800 border border-gray-700 text-xs text-gray-200 px-2 py-1 rounded">
                        {fmtDate(d.date)}: {fmt$(d.spend)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {daily.length > 1 && (
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>{fmtDate(daily[0].date)}</span>
                  <span>{fmtDate(daily[daily.length - 1].date)}</span>
                </div>
              )}
            </div>
          )}

          {/* Audience breakdown */}
          {adsetBreakdown.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="font-display font-700 text-base mb-3">Audience Breakdown</h2>
              <div className="space-y-2">
                {adsetBreakdown.map(row => (
                  <div key={row.metaAdSetId} className="bg-gray-800 rounded-lg px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{row.audienceName ?? row.metaAdSetId.slice(-8)}</span>
                      {row.audienceType && (
                        <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded-full">{row.audienceType}</span>
                      )}
                    </div>
                    <div className="text-right text-xs tabular-nums text-gray-400 shrink-0 ml-4">
                      <span className="mr-3">{fmt$(row.spend)}</span>
                      <span className="text-blue-400">{row.avgCtr.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BigStat({ label, value, sub, gradient }: { label: string; value: string; sub?: string; gradient?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-700 tabular-nums leading-tight ${gradient ? 'gradient-text' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-base font-600 tabular-nums">{value}</p>
    </div>
  );
}

interface CreativeCardProps {
  creative: CreativeStat;
  isTop: boolean;
  togglingId: string | null;
  onToggle: (id: string, status: string) => void;
}

function CreativeCard({ creative, isTop, togglingId, onToggle }: CreativeCardProps) {
  const isToggling = togglingId === creative.id;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col sm:flex-row">
      <video
        src={videoApiUrl(creative.fileUrl)}
        poster={thumbApiUrl(creative.fileUrl)}
        muted
        playsInline
        preload="none"
        className="w-full sm:w-20 h-20 object-cover shrink-0 bg-gray-800"
      />
      <div className="p-3 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">Clip {creative.index + 1}</span>
          {isTop && (
            <span className="bg-violet-900/50 text-violet-300 border border-violet-700/50 text-xs px-2 py-0.5 rounded-full">Top</span>
          )}
          {creative.adStatus === 'ACTIVE' ? (
            <span className="bg-green-900/50 text-green-300 border border-green-700/50 text-xs px-2 py-0.5 rounded-full">Active</span>
          ) : (
            <span className="bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full">Paused</span>
          )}
        </div>

        {creative.startSec !== null && creative.endSec !== null && (
          <p className="text-xs text-gray-500 mt-0.5">{creative.startSec.toFixed(0)}s – {creative.endSec.toFixed(0)}s</p>
        )}

        {creative.hasData ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-2 mt-2 text-xs">
            <div>
              <p className="text-gray-500">Link Clicks</p>
              <p className="tabular-nums font-medium text-white">{fmtK(creative.totalOutboundClicks)}</p>
            </div>
            <div>
              <p className="text-gray-500">Cost / Click</p>
              <p className="tabular-nums font-medium text-white">
                {creative.totalOutboundClicks > 0 ? fmt$(creative.totalSpend / creative.totalOutboundClicks) : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">CTR</p>
              <p className="tabular-nums font-medium text-blue-400">{creative.avgCtr.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-gray-500">Video Views</p>
              <p className="tabular-nums font-medium text-white">{fmtK(creative.totalVideoViews)}</p>
            </div>
            <div>
              <p className="text-gray-500">Spend</p>
              <p className="tabular-nums font-medium text-white">{fmt$(creative.totalSpend)}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-2">No data yet</p>
        )}

        <div className="flex justify-end mt-2">
          {creative.adStatus === 'ACTIVE' ? (
            <button type="button" onClick={() => onToggle(creative.id, creative.adStatus)} disabled={isToggling}
              className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition disabled:opacity-50">
              {isToggling ? '…' : 'Pause'}
            </button>
          ) : (
            <button type="button" onClick={() => onToggle(creative.id, creative.adStatus)} disabled={isToggling}
              className="text-xs px-3 py-1 rounded-lg bg-violet-900/50 hover:bg-violet-800/50 text-violet-300 border border-violet-700/50 transition disabled:opacity-50">
              {isToggling ? '…' : 'Resume'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
