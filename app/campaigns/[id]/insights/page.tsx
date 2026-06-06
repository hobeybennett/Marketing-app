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

function videoApiUrl(fileUrl: string): string {
  const filename = fileUrl.split('/').pop() ?? '';
  const parts = fileUrl.split('/');
  const videosIdx = parts.indexOf('videos');
  const campaignId = videosIdx > 0 ? parts[videosIdx - 1] : '';
  return `/api/videos/${campaignId}/${filename}`;
}

export default function InsightsPage({ params }: { params: { id: string } }) {
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [campaign, setCampaign] = useState<CampaignBasic | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState('');

  const fetchAll = useCallback(async () => {
    const [iRes, cRes] = await Promise.all([
      fetch(`/api/campaigns/${params.id}/insights`, { cache: 'no-store' }),
      fetch(`/api/campaigns/${params.id}`, { cache: 'no-store' }),
    ]);
    if (iRes.ok) setInsights(await iRes.json());
    if (cRes.ok) {
      const c = await cRes.json();
      setCampaign({ id: c.id, songTitle: c.songTitle, artistName: c.artistName });
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  if (loading) {
    return <div className="text-gray-400 text-center py-20">Loading…</div>;
  }

  const totals = insights?.totals ?? {
    spend: 0,
    impressions: 0,
    videoViews: 0,
    outboundClicks: 0,
    avgCtr: 0,
    avgCpc: 0,
  };
  const daily = insights?.daily ?? [];
  const adsetBreakdown = insights?.adsetBreakdown ?? [];
  const smartLink = insights?.smartLinkClicks ?? { total: 0, byPlatform: {} };
  const lastSyncAt = insights?.lastSyncAt ?? null;
  const creativeStats = insights?.creativeStats ?? [];

  const isEmpty =
    totals.spend === 0 && totals.impressions === 0 && smartLink.total === 0;

  // Daily spend chart helpers
  const maxSpend = daily.length > 0 ? Math.max(...daily.map(d => d.spend), 0.001) : 0.001;

  // Smart link platform breakdown
  const platformEntries = Object.entries(smartLink.byPlatform).sort((a, b) => b[1] - a[1]);

  // Creative performance sorted by avgCtr desc
  const sortedCreatives = [...creativeStats].sort((a, b) => b.avgCtr - a.avgCtr);

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Header row */}
      <div className="flex items-center justify-between py-4 mb-2">
        <Link href={`/campaigns/${params.id}`} className="text-gray-400 hover:text-white text-sm transition">
          ← Back to campaign
        </Link>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync from Meta'}
        </button>
      </div>

      {/* Title */}
      <div className="mb-1">
        <h1 className="font-display text-2xl font-700">
          {campaign ? (
            <>
              <span className="gradient-text">{campaign.songTitle}</span>
              {' '}
              <span className="text-gray-400 text-xl font-400">by {campaign.artistName}</span>
            </>
          ) : (
            'Campaign Performance'
          )}
        </h1>
        {lastSyncAt && (
          <p className="text-xs text-gray-500 mt-1">Last synced {timeSince(lastSyncAt)}</p>
        )}
      </div>

      {/* Sync error */}
      {syncError && (
        <div className="mt-4 border border-red-700 bg-red-900/20 rounded-xl px-4 py-3 text-sm text-red-300">
          {syncError}
        </div>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <>
          <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            <p className="text-base font-medium mb-1">No performance data yet.</p>
            <p className="text-sm">Sync from Meta once your campaign has been running.</p>
          </div>

          {/* Creative Performance (shown even in empty state if creatives exist) */}
          {creativeStats.length > 0 && (
            <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
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
                    isTop={sortIdx === 0}
                    togglingId={togglingId}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
            <StatCard label="Total Spend" value={`$${totals.spend.toFixed(2)}`} gradient />
            <StatCard label="Impressions" value={totals.impressions.toLocaleString()} />
            <StatCard label="Avg CTR" value={`${totals.avgCtr.toFixed(2)}%`} />
            <StatCard label="Video Views" value={totals.videoViews.toLocaleString()} />
            <StatCard label="Link Clicks" value={totals.outboundClicks.toLocaleString()} />
            <StatCard
              label="Avg CPC"
              value={totals.avgCpc > 0 ? `$${totals.avgCpc.toFixed(2)}` : '—'}
            />
          </div>

          {/* Creative Performance */}
          {creativeStats.length > 0 && (
            <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
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
                    isTop={sortIdx === 0}
                    togglingId={togglingId}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Smart Link card */}
          <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-700 text-base">Smart Link</h2>
              <span className="gradient-text text-2xl font-700 tabular-nums">
                {smartLink.total.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-4">Total clicks on your smart link</p>
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
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: 'linear-gradient(90deg, #7c3aed, #3b82f6)',
                          }}
                        />
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
            <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="font-display font-700 text-base mb-4">Daily Spend</h2>
              <div className="flex items-end gap-1 h-24">
                {daily.map((d, i) => {
                  const heightPct = maxSpend > 0 ? (d.spend / maxSpend) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="relative flex-1 group flex flex-col justify-end h-full"
                    >
                      <div
                        className="rounded-t w-full"
                        style={{
                          height: `${Math.max(heightPct, 2)}%`,
                          background: 'linear-gradient(180deg, #7c3aed, #3b82f6)',
                        }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap bg-gray-800 border border-gray-700 text-xs text-gray-200 px-2 py-1 rounded">
                        {fmtDate(d.date)}: ${d.spend.toFixed(2)}
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
            <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="font-display font-700 text-base mb-3">Audience Breakdown</h2>
              <div className="space-y-2">
                {adsetBreakdown.map(row => (
                  <div
                    key={row.metaAdSetId}
                    className="bg-gray-800 rounded-lg px-3 py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-sm font-medium">
                        {row.audienceName ?? row.metaAdSetId.slice(-8)}
                      </span>
                      {row.audienceType && (
                        <span className="ml-2 text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded-full">
                          {row.audienceType}
                        </span>
                      )}
                    </div>
                    <div className="text-right text-xs tabular-nums text-gray-400 shrink-0 ml-4">
                      <span className="mr-3">${row.spend.toFixed(2)}</span>
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
      {/* Video thumbnail */}
      <video
        src={videoApiUrl(creative.fileUrl)}
        muted
        playsInline
        className="w-full sm:w-20 h-20 object-cover shrink-0 bg-gray-800"
      />
      {/* Content */}
      <div className="p-3 flex-1">
        {/* Top row: clip label + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">Clip {creative.index + 1}</span>
          {isTop && (
            <span className="bg-violet-900/50 text-violet-300 border border-violet-700/50 text-xs px-2 py-0.5 rounded-full">
              Top
            </span>
          )}
          {creative.adStatus === 'ACTIVE' ? (
            <span className="bg-green-900/50 text-green-300 border border-green-700/50 text-xs px-2 py-0.5 rounded-full">
              Active
            </span>
          ) : (
            <span className="bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full">
              Paused
            </span>
          )}
        </div>

        {/* Time range */}
        {creative.startSec !== null && creative.endSec !== null && (
          <p className="text-xs text-gray-500 mt-0.5">
            {creative.startSec.toFixed(0)}s – {creative.endSec.toFixed(0)}s
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
          {creative.hasData ? (
            <>
              <span>CTR <span className="text-blue-400 tabular-nums">{creative.avgCtr.toFixed(2)}%</span></span>
              <span>Spend <span className="tabular-nums">${creative.totalSpend.toFixed(2)}</span></span>
              <span>Views <span className="tabular-nums">{creative.totalVideoViews.toLocaleString()}</span></span>
            </>
          ) : (
            <span className="text-gray-500">No data yet</span>
          )}
        </div>

        {/* Bottom row: pause/resume button */}
        <div className="flex justify-end mt-2">
          {creative.adStatus === 'ACTIVE' ? (
            <button
              type="button"
              onClick={() => onToggle(creative.id, creative.adStatus)}
              disabled={isToggling}
              className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition disabled:opacity-50"
            >
              {isToggling ? '…' : 'Pause'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggle(creative.id, creative.adStatus)}
              disabled={isToggling}
              className="text-xs px-3 py-1 rounded-lg bg-violet-900/50 hover:bg-violet-800/50 text-violet-300 border border-violet-700/50 transition disabled:opacity-50"
            >
              {isToggling ? '…' : 'Resume'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, gradient }: { label: string; value: string; gradient?: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-700 tabular-nums ${gradient ? 'gradient-text' : ''}`}>{value}</p>
    </div>
  );
}
