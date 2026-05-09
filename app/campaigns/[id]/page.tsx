'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const PROCESSING_STATUSES = new Set(['PENDING', 'PROCESSING', 'LAUNCHING']);
const TERMINAL_STATUSES = new Set(['READY', 'LIVE', 'FAILED', 'PAUSED']);

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  READY: 'Ready for Launch',
  LAUNCHING: 'Launching',
  LIVE: 'Live',
  FAILED: 'Failed',
  PAUSED: 'Paused',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-gray-400',
  PROCESSING: 'text-blue-400',
  READY: 'text-yellow-400',
  LAUNCHING: 'text-purple-400',
  LIVE: 'text-green-400',
  FAILED: 'text-red-400',
  PAUSED: 'text-gray-400',
};

const JOB_STAGE_LABELS: Record<string, string> = {
  SEGMENTATION: 'Audio Segmentation',
  VIDEO_GEN: 'Video Generation',
  COPY_GEN: 'Ad Copy Generation',
  AUDIENCE_GEN: 'Audience Setup',
  META_SETUP: 'Meta Campaign Setup',
};

const JOB_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-gray-500',
  RUNNING: 'text-blue-400',
  DONE: 'text-green-400',
  FAILED: 'text-red-400',
};

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCampaign = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${params.id}`);
    if (res.ok) setCampaign(await res.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    if (!campaign || TERMINAL_STATUSES.has(campaign.status)) return;
    const interval = setInterval(fetchCampaign, 3000);
    return () => clearInterval(interval);
  }, [campaign, fetchCampaign]);

  async function handleAction(action: string) {
    setActionLoading(true);
    const res = await fetch(`/api/campaigns/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) await fetchCampaign();
    setActionLoading(false);
  }

  if (loading) return <p className="text-gray-400">Loading…</p>;
  if (!campaign) return <p className="text-red-400">Campaign not found.</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push('/campaigns')}
            className="text-gray-400 hover:text-white text-sm mb-3 block"
          >
            ← Back to campaigns
          </button>
          <h1 className="text-3xl font-bold">{campaign.songTitle}</h1>
          <p className="text-gray-400 text-lg">{campaign.artistName}</p>
          {campaign.genre && <p className="text-sm text-gray-500 mt-1">{campaign.genre}</p>}
        </div>
        <div className="text-right">
          <span className={`text-lg font-semibold ${STATUS_COLORS[campaign.status] ?? 'text-gray-400'}`}>
            {STATUS_LABELS[campaign.status] ?? campaign.status}
          </span>
          {campaign.metaCampaignId && (
            <p className="text-xs text-gray-500 mt-1">Meta: {campaign.metaCampaignId}</p>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Processing Pipeline</h2>
        <div className="space-y-3">
          {campaign.jobs?.map((job: any) => (
            <div key={job.id} className="flex items-center justify-between">
              <span className="text-gray-300 text-sm">{JOB_STAGE_LABELS[job.stage] ?? job.stage}</span>
              <span className={`text-sm font-medium ${JOB_STATUS_COLORS[job.status] ?? 'text-gray-500'}`}>
                {job.status === 'RUNNING' ? '⟳ Running' : job.status}
                {job.error && (
                  <span className="text-red-300 ml-2 text-xs">— {job.error}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Approval banner */}
      {campaign.status === 'READY' && (() => {
        const hasApprovedCreative = campaign.creatives?.some(
          (c: any) => c.adCopies?.length > 0
        );
        return (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-6">
            <h2 className="font-semibold mb-2">Ready for Launch</h2>
            <p className="text-gray-400 text-sm mb-4">
              All creatives and copy have been generated. Review below, then launch.
            </p>
            {!hasApprovedCreative && (
              <p className="text-yellow-500 text-sm mb-3">
                Waiting for at least 1 creative with ad copy before launch is available.
              </p>
            )}
            <button
              onClick={() => handleAction('launch')}
              disabled={actionLoading || !hasApprovedCreative}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition"
            >
              {actionLoading ? 'Launching…' : 'Launch Campaign'}
            </button>
          </div>
        );
      })()}

      {/* Audio segments */}
      {campaign.segments?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Audio Segments ({campaign.segments.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {campaign.segments.map((seg: any) => (
              <div key={seg.id} className="bg-gray-800 rounded-lg p-3 text-sm">
                <p className="font-medium">Segment {seg.index + 1}</p>
                <p className="text-gray-400">
                  {seg.startSec.toFixed(1)}s – {seg.endSec.toFixed(1)}s
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Creatives + copy */}
      {campaign.creatives?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Video Creatives ({campaign.creatives.length})</h2>
          <div className="space-y-4">
            {campaign.creatives.map((creative: any) => (
              <div key={creative.id} className="bg-gray-800 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">CTA: {creative.ctaText}</p>
                {creative.adCopies?.[0] && (
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="text-gray-500">Headline: </span>
                      {creative.adCopies[0].headline}
                    </p>
                    <p>
                      <span className="text-gray-500">Copy: </span>
                      {creative.adCopies[0].primaryText}
                    </p>
                    {creative.adCopies[0].description && (
                      <p>
                        <span className="text-gray-500">Description: </span>
                        {creative.adCopies[0].description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audiences */}
      {campaign.audiences?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Audiences ({campaign.audiences.length})</h2>
          <div className="space-y-3">
            {campaign.audiences.map((aud: any) => (
              <div key={aud.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <p className="font-medium text-sm">{aud.name}</p>
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                    {aud.type}
                  </span>
                </div>
                {aud.interests?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">Interests: {aud.interests.join(', ')}</p>
                )}
                {aud.metaAdSetId && (
                  <p className="text-xs text-gray-500 mt-1">Ad Set: {aud.metaAdSetId}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
