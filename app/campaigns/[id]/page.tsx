'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const POLLING_STATUSES = new Set(['PENDING', 'PROCESSING', 'BUILDING', 'LAUNCHING']);

const STAGE_LABELS: Record<string, string> = {
  SEGMENTATION: 'Splitting audio into segments',
  VIDEO_GEN: 'Generating videos',
  COPY_GEN: 'Writing ad copy',
  AUDIENCE_GEN: 'Building audiences',
  META_SETUP: 'Setting up Meta campaign',
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

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  useEffect(() => {
    if (!campaign || !POLLING_STATUSES.has(campaign.status)) return;
    const interval = setInterval(fetchCampaign, 2000);
    return () => clearInterval(interval);
  }, [campaign, fetchCampaign]);

  async function handleAction(action: string) {
    setActionLoading(true);
    await fetch(`/api/campaigns/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await fetchCampaign();
    setActionLoading(false);
  }

  if (loading) return <div className="text-gray-400 text-center py-20">Loading…</div>;
  if (!campaign) return <div className="text-red-400 text-center py-20">Campaign not found.</div>;

  const { status } = campaign;

  // ── Phase 1: content generating ──────────────────────────────────────────
  if (status === 'PENDING' || status === 'PROCESSING') {
    const contentJobs = campaign.jobs?.filter((j: any) =>
      j.stage === 'SEGMENTATION' || j.stage === 'VIDEO_GEN'
    ) ?? [];

    return (
      <div className="max-w-xl mx-auto">
        <BackButton onClick={() => router.push('/campaigns')} />
        <TrackHeader campaign={campaign} />

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
          <h2 className="font-semibold text-lg mb-1">Creating your content</h2>
          <p className="text-sm text-gray-400 mb-6">
            Splitting your track and generating 5 video clips…
          </p>
          <div className="space-y-4">
            {contentJobs.map((job: any) => (
              <StageRow key={job.stage} job={job} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 1 done: show content ────────────────────────────────────────────
  if (status === 'CONTENT_READY') {
    return (
      <div className="max-w-xl mx-auto">
        <BackButton onClick={() => router.push('/campaigns')} />
        <TrackHeader campaign={campaign} />

        <div className="mt-6 mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Your videos are ready</h2>
            <p className="text-sm text-gray-400">{campaign.creatives?.length} clips generated</p>
          </div>
          <span className="text-green-400 text-sm font-medium">✓ Content done</span>
        </div>

        <div className="space-y-3 mb-6">
          {campaign.creatives?.map((creative: any, i: number) => (
            <div key={creative.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
              {campaign.coverArtUrl?.startsWith('http') && (
                <Image
                  src={campaign.coverArtUrl}
                  alt="cover"
                  width={48}
                  height={48}
                  className="rounded-lg shrink-0"
                  unoptimized
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Clip {i + 1}</p>
                <p className="text-xs text-gray-400">
                  {campaign.segments?.[i]?.startSec.toFixed(0)}s –{' '}
                  {campaign.segments?.[i]?.endSec.toFixed(0)}s
                </p>
              </div>
              <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full shrink-0">
                {creative.ctaText}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => handleAction('continue')}
          disabled={actionLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-3 rounded-xl font-semibold text-lg transition"
        >
          {actionLoading ? 'Starting…' : 'Continue to Campaign Setup →'}
        </button>
      </div>
    );
  }

  // ── Phase 2: campaign building ────────────────────────────────────────────
  if (status === 'BUILDING') {
    const campaignJobs = campaign.jobs?.filter((j: any) =>
      j.stage === 'COPY_GEN' || j.stage === 'AUDIENCE_GEN'
    ) ?? [];

    return (
      <div className="max-w-xl mx-auto">
        <BackButton onClick={() => router.push('/campaigns')} />
        <TrackHeader campaign={campaign} />

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
          <h2 className="font-semibold text-lg mb-1">Building your campaign</h2>
          <p className="text-sm text-gray-400 mb-6">Writing ad copy and setting up audiences…</p>
          <div className="space-y-4">
            {campaignJobs.map((job: any) => (
              <StageRow key={job.stage} job={job} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 2 done: ready to launch ─────────────────────────────────────────
  if (status === 'READY') {
    const hasCreativeWithCopy = campaign.creatives?.some((c: any) => c.adCopies?.length > 0);

    return (
      <div className="max-w-xl mx-auto space-y-4">
        <BackButton onClick={() => router.push('/campaigns')} />
        <TrackHeader campaign={campaign} />

        <div className="bg-green-900/20 border border-green-700 rounded-xl p-5">
          <h2 className="font-semibold text-lg mb-1">Ready to launch</h2>
          <p className="text-sm text-gray-400">Everything's set up. Review below and launch when ready.</p>
        </div>

        {/* Creatives + copy */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="font-semibold mb-3">Video Creatives ({campaign.creatives?.length})</h3>
          <div className="space-y-3">
            {campaign.creatives?.map((creative: any, i: number) => (
              <div key={creative.id} className="bg-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Clip {i + 1}</p>
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">{creative.ctaText}</span>
                </div>
                {creative.adCopies?.[0] && (
                  <div className="text-xs text-gray-300 space-y-1">
                    <p><span className="text-gray-500">Headline: </span>{creative.adCopies[0].headline}</p>
                    <p><span className="text-gray-500">Copy: </span>{creative.adCopies[0].primaryText}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Audiences */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="font-semibold mb-3">Audiences ({campaign.audiences?.length})</h3>
          <div className="space-y-2">
            {campaign.audiences?.map((aud: any) => (
              <div key={aud.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-sm">{aud.name}</p>
                <span className="text-xs text-gray-500">{aud.type}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => handleAction('launch')}
          disabled={actionLoading || !hasCreativeWithCopy}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 rounded-xl font-semibold text-lg transition"
        >
          {actionLoading ? 'Launching…' : 'Launch Campaign'}
        </button>
      </div>
    );
  }

  // ── Live ──────────────────────────────────────────────────────────────────
  if (status === 'LIVE' || status === 'LAUNCHING') {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <BackButton onClick={() => router.push('/campaigns')} />
        <div className="text-5xl mb-4">{status === 'LIVE' ? '🚀' : '⏳'}</div>
        <h2 className="text-2xl font-bold mb-2">{status === 'LIVE' ? 'Campaign is live!' : 'Launching…'}</h2>
        <p className="text-gray-400">{campaign.artistName} — {campaign.songTitle}</p>
        {campaign.metaCampaignId && (
          <p className="text-xs text-gray-600 mt-4">Meta ID: {campaign.metaCampaignId}</p>
        )}
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto text-center py-12">
      <BackButton onClick={() => router.push('/campaigns')} />
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
      <p className="text-gray-400">Status: {status}</p>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-gray-400 hover:text-white text-sm mb-4 block">
      ← Back to campaigns
    </button>
  );
}

function TrackHeader({ campaign }: { campaign: any }) {
  return (
    <div className="flex items-center gap-4">
      {campaign.coverArtUrl?.startsWith('http') && (
        <Image
          src={campaign.coverArtUrl}
          alt="cover"
          width={56}
          height={56}
          className="rounded-lg shrink-0"
          unoptimized
        />
      )}
      <div>
        <h1 className="text-xl font-bold leading-tight">{campaign.songTitle}</h1>
        <p className="text-gray-400">{campaign.artistName}</p>
      </div>
    </div>
  );
}

function StageRow({ job }: { job: any }) {
  const icon = job.status === 'DONE' ? '✓' : job.status === 'RUNNING' ? '⟳' : '○';
  const color = job.status === 'DONE' ? 'text-green-400' : job.status === 'RUNNING' ? 'text-blue-400 animate-pulse' : 'text-gray-600';
  return (
    <div className="flex items-center gap-3">
      <span className={`text-lg font-bold ${color}`}>{icon}</span>
      <span className={`text-sm ${job.status === 'PENDING' ? 'text-gray-500' : 'text-gray-200'}`}>
        {STAGE_LABELS[job.stage] ?? job.stage}
      </span>
    </div>
  );
}
