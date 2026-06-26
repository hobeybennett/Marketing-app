'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DeleteCampaignButton from '@/components/DeleteCampaignButton';

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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

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
    const doneCount = contentJobs.filter((j: any) => j.status === 'DONE').length;
    const pct = Math.round((doneCount / Math.max(contentJobs.length, 1)) * 100);
    const ageMs = now - new Date(campaign.createdAt).getTime();
    const anyRunning = contentJobs.some((j: any) => j.status === 'RUNNING');
    // Stale if older than 5 min and nothing is actively running (covers partial progress too)
    const isStale = ageMs > 5 * 60 * 1000 && !anyRunning && pct < 100;

    return (
      <div className="max-w-xl mx-auto">
        <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
        <TrackHeader campaign={campaign} />

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-700 text-lg">Creating your content</h2>
            <span className="text-sm text-gray-400">{pct}%</span>
          </div>
          <p className="text-sm text-gray-400 mb-4">Splitting your track and generating 5 video clips…</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-6">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(pct, 5)}%`, background: 'linear-gradient(90deg, #7c3aed, #3b82f6)' }}
            />
          </div>
          <div className="space-y-4">
            {contentJobs.map((job: any) => (
              <StageRow key={job.stage} job={job} />
            ))}
          </div>
          {isStale && (
            <div className="mt-5 rounded-lg border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
              <p className="font-semibold mb-1">Taking longer than expected</p>
              <p className="mb-3 text-yellow-400">The worker may have been down when this was submitted. Click retry to requeue it.</p>
              <button
                onClick={() => handleAction('retry-stuck')}
                disabled={actionLoading}
                className="px-4 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Retrying…' : 'Retry now'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase 1 done: show content ────────────────────────────────────────────
  if (status === 'CONTENT_READY') {
    return (
      <div className="max-w-xl mx-auto">
        <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
        <TrackHeader campaign={campaign} />

        <div className="mt-6 mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Your videos are ready</h2>
            <p className="text-sm text-gray-400">{campaign.creatives?.length} clips generated</p>
          </div>
          <span className="text-green-400 text-sm font-medium">Content ready</span>
        </div>

        <div className="space-y-3 mb-6">
          {campaign.creatives?.map((creative: any, i: number) => (
            <div key={creative.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {creative.fileUrl ? (
                <video
                  src={videoApiUrl(creative.fileUrl)}
                  controls
                  playsInline
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div className="w-full aspect-square bg-gray-800 flex items-center justify-center text-gray-600 text-sm">
                  Processing…
                </div>
              )}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Clip {i + 1}</p>
                  <p className="text-xs text-gray-400">
                    {campaign.segments?.[i]?.startSec?.toFixed(0)}s – {campaign.segments?.[i]?.endSec?.toFixed(0)}s
                  </p>
                </div>
                <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full shrink-0">
                  {creative.ctaText}
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => handleAction('continue')}
          disabled={actionLoading}
          className="btn-primary w-full px-6 py-3 text-lg disabled:opacity-50"
        >
          {actionLoading ? 'Starting…' : 'Continue to Campaign Setup'}
        </button>
      </div>
    );
  }

  // ── Phase 2: campaign building ────────────────────────────────────────────
  if (status === 'BUILDING') {
    const campaignJobs = campaign.jobs?.filter((j: any) =>
      j.stage === 'COPY_GEN' || j.stage === 'AUDIENCE_GEN'
    ) ?? [];
    const doneCount = campaignJobs.filter((j: any) => j.status === 'DONE').length;
    const pct = Math.round((doneCount / Math.max(campaignJobs.length, 1)) * 100);

    return (
      <div className="max-w-xl mx-auto">
        <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
        <TrackHeader campaign={campaign} />

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-700 text-lg">Building your campaign</h2>
            <span className="text-sm text-gray-400">{pct}%</span>
          </div>
          <p className="text-sm text-gray-400 mb-4">Writing ad copy and setting up audiences…</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-6">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(pct, 5)}%`, background: 'linear-gradient(90deg, #7c3aed, #3b82f6)' }}
            />
          </div>
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
    return <ReadyToLaunch campaign={campaign} params={params} handleAction={handleAction} actionLoading={actionLoading} router={router} />;
  }

  // ── Paused ───────────────────────────────────────────────────────────────
  if (status === 'PAUSED') {
    return (
      <div className="max-w-xl mx-auto py-8">
        <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl font-700 mb-2">Campaign paused</h2>
          <p className="text-gray-400">{campaign.artistName} — {campaign.songTitle}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4 text-sm text-gray-400 text-center">
          Your Meta ads are paused and not spending. Resume to continue delivery.
        </div>
        <button
          onClick={() => handleAction('resume')}
          disabled={actionLoading}
          className="btn-primary w-full py-3 disabled:opacity-50"
        >
          {actionLoading ? 'Resuming…' : 'Resume Campaign'}
        </button>
      </div>
    );
  }

  // ── Live ──────────────────────────────────────────────────────────────────
  if (status === 'LIVE' || status === 'LAUNCHING') {
    const smartLinkUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/go/${params.id}`;
    const launchingMs = now - new Date(campaign.updatedAt).getTime();
    const isStuckLaunching = status === 'LAUNCHING' && launchingMs > 3 * 60 * 1000;
    return (
      <div className="max-w-xl mx-auto py-8">
        <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl font-700 mb-2">{status === 'LIVE' ? 'Campaign is live' : 'Launching…'}</h2>
          <p className="text-gray-400">{campaign.artistName} — {campaign.songTitle}</p>
          {campaign.metaCampaignId && (
            <p className="text-xs text-gray-600 mt-4">Meta ID: {campaign.metaCampaignId}</p>
          )}
        </div>

        {isStuckLaunching && (
          <div className="mb-4 rounded-xl border border-yellow-700 bg-yellow-900/20 px-4 py-4 text-sm text-yellow-300">
            <p className="font-semibold mb-1">Taking longer than expected</p>
            <p className="text-yellow-400/80 mb-3">The launch job may have stalled. Meta campaign setup is resumable — click retry to continue from where it left off.</p>
            <button
              onClick={() => handleAction('retry-launch')}
              disabled={actionLoading}
              className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              {actionLoading ? 'Retrying…' : 'Retry Launch'}
            </button>
          </div>
        )}

        {status === 'LIVE' && (
          <>
            {/* Pause control */}
            <div className="flex justify-end mb-2">
              <button
                onClick={() => handleAction('pause')}
                disabled={actionLoading}
                className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {actionLoading ? 'Pausing…' : 'Pause campaign'}
              </button>
            </div>

            {/* Smart Link section */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
              <h3 className="font-semibold mb-1">Smart Link</h3>
              <p className="text-sm text-gray-400 mb-3">Share this link to send fans to your streaming platforms.</p>
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                <code className="text-xs text-green-400 flex-1 truncate">/go/{params.id}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(smartLinkUrl)}
                  className="text-xs text-gray-400 hover:text-white transition shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Performance link */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="font-semibold mb-1">Performance</h3>
              <p className="text-sm text-gray-400 mb-3">View ad spend, CTR, and optimisation actions.</p>
              <a
                href={`/campaigns/${params.id}/insights`}
                className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition"
              >
                View Performance
              </a>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────────────────
  const failedJob = campaign.jobs?.find((j: any) => j.status === 'FAILED');
  const isMetaSetupFailure = failedJob?.stage === 'META_SETUP';
  return (
    <div className="max-w-xl mx-auto py-12">
      <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
        {failedJob && (
          <p className="text-gray-400 text-sm">Failed at: <span className="text-white">{STAGE_LABELS[failedJob.stage] ?? failedJob.stage}</span></p>
        )}
      </div>
      {isMetaSetupFailure && (
        <div className="mb-4 border border-amber-700/50 bg-amber-900/15 rounded-xl p-5">
          <p className="font-semibold text-amber-200 mb-1">Meta account issue</p>
          <p className="text-sm text-amber-300/80 mb-3">
            The campaign failed while setting up your Meta ads. Make sure your Meta account is connected and your Ad Account is active.
          </p>
          <a href="/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300 hover:text-amber-100 border border-amber-700/60 hover:border-amber-500 px-4 py-2 rounded-lg transition">
            Check Meta in Settings
          </a>
        </div>
      )}
      {failedJob?.error && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 mb-4">
          <p className="text-xs text-red-300 font-mono break-all whitespace-pre-wrap">{failedJob.error}</p>
        </div>
      )}
      <button
        onClick={() => handleAction('retry')}
        disabled={actionLoading}
        className="btn-primary w-full py-3 disabled:opacity-50"
      >
        {actionLoading ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}

function ReadyToLaunch({ campaign, params, handleAction, actionLoading, router }: {
  campaign: any;
  params: { id: string };
  handleAction: (action: string) => Promise<void>;
  actionLoading: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const copies: any[] = campaign.adCopies ?? [];
  const initialSelected = copies.find((c: any) => c.isSelected)?.id ?? copies[0]?.id ?? null;
  const [selectedCopyId, setSelectedCopyId] = useState<string | null>(initialSelected);
  const [selecting, setSelecting] = useState(false);
  const hasMetaConnection = campaign.hasMetaConnection;

  async function selectCopy(copyId: string) {
    setSelectedCopyId(copyId);
    setSelecting(true);
    await fetch(`/api/campaigns/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'select-copy', copyId }),
    });
    setSelecting(false);
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
      <TrackHeader campaign={campaign} />

      {hasMetaConnection ? (
        <div className="bg-green-900/20 border border-green-700 rounded-xl p-5">
          <h2 className="font-display font-700 text-lg mb-1">Ready to launch</h2>
          <p className="text-sm text-gray-400">Pick your ad copy below, then launch.</p>
        </div>
      ) : (
        <div className="border border-amber-700/50 bg-amber-900/15 rounded-xl p-5">
          <h2 className="font-display font-700 text-lg mb-1 text-amber-200">Connect Meta to launch</h2>
          <p className="text-sm text-amber-300/80 mb-3">
            Your videos and ad copy are ready — connect your Meta account before going live.
          </p>
          <a href="/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300 hover:text-amber-100 border border-amber-700/60 hover:border-amber-500 px-4 py-2 rounded-lg transition">
            Go to Settings to connect Meta
          </a>
        </div>
      )}

      {/* Ad copy picker */}
      {copies.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Choose your ad copy</h3>
            <span className="text-xs text-gray-500">Same copy runs on all 5 clips</span>
          </div>
          <div className="space-y-2">
            {copies.map((copy: any, i: number) => {
              const isSelected = copy.id === selectedCopyId;
              return (
                <button
                  key={copy.id}
                  type="button"
                  onClick={() => !selecting && selectCopy(copy.id)}
                  className={`w-full text-left rounded-xl border p-4 transition ${
                    isSelected
                      ? 'border-violet-600 bg-violet-900/20'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition ${
                      isSelected ? 'border-violet-500' : 'border-gray-600'
                    }`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 font-mono">Option {i + 1}</span>
                        {isSelected && <span className="text-xs text-violet-400 font-medium">Selected</span>}
                      </div>
                      <p className="text-sm font-semibold text-white mb-0.5">{copy.headline}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{copy.primaryText}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Video clips (read-only — the A/B test) */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Video clips ({campaign.creatives?.length})</h3>
          <span className="text-xs text-gray-500">A/B testing which section performs best</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {campaign.creatives?.map((creative: any, i: number) => (
            <div key={creative.id} className="text-center">
              {creative.fileUrl ? (
                <video
                  src={videoApiUrl(creative.fileUrl)}
                  poster={thumbApiUrl(creative.fileUrl)}
                  muted
                  playsInline
                  preload="none"
                  className="w-full aspect-square object-cover rounded-lg bg-gray-700"
                />
              ) : (
                <div className="w-full aspect-square bg-gray-800 rounded-lg" />
              )}
              <p className="text-xs text-gray-500 mt-1">Clip {i + 1}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Audience */}
      {campaign.audiences?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="font-semibold mb-3">Audience</h3>
          <div className="space-y-2">
            {campaign.audiences.map((aud: any) => (
              <div key={aud.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-sm">{aud.name}</p>
                <span className="text-xs text-gray-500">{aud.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget summary */}
      {(() => {
        const budgetUsd = (campaign.visualConfig as any)?.dailyBudgetUsd ?? 10;
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Daily ad spend</p>
                <p className="text-xs text-gray-500 mt-0.5">Split across 3 audiences (~${(budgetUsd / 3).toFixed(2)}/day each)</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-white">${budgetUsd}<span className="text-sm font-normal text-gray-400">/day</span></p>
                <p className="text-xs text-gray-600">total</p>
              </div>
            </div>
          </div>
        );
      })()}

      <button
        onClick={() => handleAction('launch')}
        disabled={actionLoading || !selectedCopyId || !hasMetaConnection}
        className="btn-primary w-full px-6 py-3 text-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {actionLoading ? 'Launching…' : 'Launch Campaign'}
      </button>
    </div>
  );
}

function BackButton({ onClick, campaignId }: { onClick: () => void; campaignId: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <button onClick={onClick} className="text-gray-400 hover:text-white text-sm">
        Back to campaigns
      </button>
      <DeleteCampaignButton campaignId={campaignId} redirect />
    </div>
  );
}

function TrackHeader({ campaign }: { campaign: any }) {
  const coverSrc = campaign.coverArtUrl?.startsWith('http')
    ? campaign.coverArtUrl
    : `/api/covers/${campaign.id}`;

  return (
    <div className="flex items-center gap-4">
      <Image
        src={coverSrc}
        alt="cover"
        width={56}
        height={56}
        className="rounded-lg shrink-0 bg-gray-800"
        unoptimized
      />
      <div>
        <h1 className="font-display text-xl font-700 leading-tight">{campaign.songTitle}</h1>
        <p className="text-gray-400">{campaign.artistName}</p>
      </div>
    </div>
  );
}

function StageRow({ job }: { job: any }) {
  const isDone = job.status === 'DONE';
  const isRunning = job.status === 'RUNNING';
  const isFailed = job.status === 'FAILED';

  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
        {isDone && (
          <svg className="text-green-400 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {isRunning && (
          <svg className="animate-spin text-blue-400 w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {isFailed && (
          <svg className="text-red-400 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {!isDone && !isRunning && !isFailed && (
          <div className="w-4 h-4 rounded-full border-2 border-gray-600" />
        )}
      </div>
      <span className={`text-sm ${isDone ? 'text-green-300' : isRunning ? 'text-blue-300 font-medium' : isFailed ? 'text-red-400' : 'text-gray-500'}`}>
        {STAGE_LABELS[job.stage] ?? job.stage}
        {isFailed && job.error && (
          <span className="block text-xs text-red-500 mt-0.5">{job.error}</span>
        )}
      </span>
    </div>
  );
}
