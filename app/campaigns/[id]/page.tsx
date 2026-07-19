'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import DeleteCampaignButton from '@/components/DeleteCampaignButton';
import AiVideoUpgrade from './AiVideoUpgrade';

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

const TOTAL_CLIPS = 5;

// Pre-launch states that all render the progressive workspace. Polled while working.
const WORKSPACE_STATUSES = new Set(['PENDING', 'PROCESSING', 'CONTENT_READY', 'BUILDING', 'READY']);
const POLLING_STATUSES = new Set(['PENDING', 'PROCESSING', 'CONTENT_READY', 'BUILDING', 'LAUNCHING']);

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

  // ── Progressive workspace: prep + review + launch on one page ────────────────
  if (WORKSPACE_STATUSES.has(status)) {
    return (
      <CampaignWorkspace
        campaign={campaign}
        params={params}
        handleAction={handleAction}
        actionLoading={actionLoading}
        router={router}
        now={now}
      />
    );
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
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
              <h3 className="font-semibold mb-1">Performance</h3>
              <p className="text-sm text-gray-400 mb-3">View ad spend, CTR, and optimisation actions.</p>
              <a
                href={`/campaigns/${params.id}/insights`}
                className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition"
              >
                View Performance
              </a>
            </div>

            {/* AI video (owner can test-generate here; picking "Use this" on a live
                campaign would rebuild its videos, so only the owner test path). */}
            <AiVideoUpgrade
              campaignId={params.id}
              status={(campaign as any).aiVideoStatus}
              options={(campaign as any).aiVideoOptions as string[] | null}
              choiceUrl={(campaign as any).aiVideoChoiceUrl}
              isOwner={(campaign as any).isOwner}
            />
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

// ── Progressive workspace ─────────────────────────────────────────────────────
// One page that reveals each piece as it's ready: ad copy + audiences are ready
// in seconds (so the user can start picking) while videos render in the background.
function CampaignWorkspace({ campaign, params, handleAction, actionLoading, router, now }: {
  campaign: any;
  params: { id: string };
  handleAction: (action: string) => Promise<void>;
  actionLoading: boolean;
  router: ReturnType<typeof useRouter>;
  now: number;
}) {
  const jobs: any[] = campaign.jobs ?? [];
  const jobStatus = (stage: string) => jobs.find((j) => j.stage === stage)?.status;
  const segDone = jobStatus('SEGMENTATION') === 'DONE';
  const copyDone = jobStatus('COPY_GEN') === 'DONE';
  const audienceDone = jobStatus('AUDIENCE_GEN') === 'DONE';
  const videoDone = jobStatus('VIDEO_GEN') === 'DONE';

  const creatives: any[] = campaign.creatives ?? [];
  const videoCount = Math.min(creatives.length, TOTAL_CLIPS);
  const copies: any[] = campaign.adCopies ?? [];
  const audiences: any[] = campaign.audiences ?? [];
  const hasMetaConnection = campaign.hasMetaConnection;

  const allReady = copyDone && audienceDone && videoDone;

  const [selectedCopyId, setSelectedCopyId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  // Initialise the selection once copies arrive (they may not exist on first render).
  useEffect(() => {
    if (selectedCopyId || copies.length === 0) return;
    setSelectedCopyId(copies.find((c) => c.isSelected)?.id ?? copies[0]?.id ?? null);
  }, [copies, selectedCopyId]);

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

  // Smooth progress: segmentation + copy + audiences (1 unit each) + each video clip.
  const doneUnits = (segDone ? 1 : 0) + (copyDone ? 1 : 0) + (audienceDone ? 1 : 0) + videoCount;
  const pct = Math.round((doneUnits / (3 + TOTAL_CLIPS)) * 100);

  const ageMs = now - new Date(campaign.createdAt).getTime();
  const anyRunning = jobs.some(
    (j) => ['SEGMENTATION', 'COPY_GEN', 'AUDIENCE_GEN', 'VIDEO_GEN'].includes(j.stage) && j.status === 'RUNNING',
  );
  const isStale = !allReady && ageMs > 5 * 60 * 1000 && !anyRunning;

  const steps = [
    { key: 'SEGMENTATION', label: 'Splitting your track', done: segDone },
    { key: 'COPY_GEN', label: 'Writing your ad copy', done: copyDone },
    { key: 'AUDIENCE_GEN', label: 'Building your audiences', done: audienceDone },
    {
      key: 'VIDEO_GEN',
      label: videoDone ? 'Videos ready' : `Generating videos (${videoCount}/${TOTAL_CLIPS})`,
      done: videoDone,
    },
  ];
  const activeKey = steps.find((s) => !s.done)?.key;

  const budgetUsd = (campaign.visualConfig as any)?.dailyBudgetUsd ?? 10;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <BackButton onClick={() => router.push('/campaigns')} campaignId={params.id} />
      <TrackHeader campaign={campaign} />

      {/* Header: progress while working, or ready banner when done */}
      {allReady ? (
        hasMetaConnection ? (
          <div className="bg-green-900/20 border border-green-700 rounded-xl p-5">
            <h2 className="font-display font-700 text-lg mb-1">Ready to launch 🎉</h2>
            <p className="text-sm text-gray-400">Pick your ad copy below, then launch.</p>
          </div>
        ) : (
          <div className="border border-amber-700/50 bg-amber-900/15 rounded-xl p-5">
            <h2 className="font-display font-700 text-lg mb-1 text-amber-200">Connect Meta to launch</h2>
            <p className="text-sm text-amber-300/80 mb-3">
              Everything&apos;s ready — connect your Meta account before going live.
            </p>
            <a href="/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300 hover:text-amber-100 border border-amber-700/60 hover:border-amber-500 px-4 py-2 rounded-lg transition">
              Go to Settings to connect Meta
            </a>
          </div>
        )
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-700 text-lg">Building your campaign</h2>
            <span className="text-sm text-gray-400">{pct}%</span>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            {copyDone
              ? 'Pick your ad copy below while we finish rendering your videos…'
              : 'Setting everything up — this takes about a minute…'}
          </p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-6">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(pct, 5)}%`, background: 'linear-gradient(90deg, #7c3aed, #3b82f6)' }}
            />
          </div>
          <div className="space-y-3">
            {steps.map((s) => (
              <WorkspaceStep key={s.key} label={s.label} done={s.done} active={s.key === activeKey} />
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
      )}

      {/* AI video upsell — appears once the initial creatives exist */}
      {campaign.creatives?.length > 0 && (
        <AiVideoUpgrade
          campaignId={params.id}
          status={(campaign as any).aiVideoStatus}
          options={(campaign as any).aiVideoOptions as string[] | null}
          choiceUrl={(campaign as any).aiVideoChoiceUrl}
          isOwner={(campaign as any).isOwner}
        />
      )}

      {/* Ad copy picker — appears as soon as copy is ready, even mid-render */}
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

      {/* Video clips — fill in one at a time as they render */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            Video clips {videoDone ? `(${TOTAL_CLIPS})` : `(${videoCount}/${TOTAL_CLIPS})`}
          </h3>
          <span className="text-xs text-gray-500">
            {videoDone ? 'A/B testing which section performs best' : 'Rendering…'}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: TOTAL_CLIPS }).map((_, i) => {
            const creative = creatives[i];
            return (
              <div key={i} className="text-center">
                {creative?.fileUrl ? (
                  <video
                    src={videoApiUrl(creative.fileUrl)}
                    poster={thumbApiUrl(creative.fileUrl)}
                    muted
                    playsInline
                    preload="none"
                    className="w-full aspect-square object-cover rounded-lg bg-gray-700"
                  />
                ) : (
                  <div className="w-full aspect-square bg-gray-800 rounded-lg flex items-center justify-center animate-pulse">
                    <svg className="animate-spin w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">Clip {i + 1}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audience */}
      {audiences.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="font-semibold mb-3">Audience</h3>
          <div className="space-y-2">
            {audiences.map((aud: any) => (
              <div key={aud.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <p className="text-sm">{aud.name}</p>
                <span className="text-xs text-gray-500">{aud.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Daily ad spend</p>
            <p className="text-xs text-gray-500 mt-0.5">Across Facebook &amp; Instagram, targeting music fans</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-white">${budgetUsd}<span className="text-sm font-normal text-gray-400">/day</span></p>
            <p className="text-xs text-gray-600">total</p>
          </div>
        </div>
      </div>

      {/* Launch */}
      <button
        onClick={() => handleAction('launch')}
        disabled={actionLoading || !allReady || !selectedCopyId || !hasMetaConnection}
        className="btn-primary w-full px-6 py-3 text-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {actionLoading ? 'Launching…' : allReady ? 'Launch Campaign' : 'Finishing your videos…'}
      </button>
      {!allReady && (
        <p className="text-center text-xs text-gray-500">
          Pick your ad copy now — the Launch button unlocks the moment your videos are ready.
        </p>
      )}
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

function WorkspaceStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 shrink-0 flex items-center justify-center">
        {done ? (
          <svg className="text-green-400 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : active ? (
          <svg className="animate-spin text-blue-400 w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-gray-600" />
        )}
      </div>
      <span className={`text-sm ${done ? 'text-green-300' : active ? 'text-blue-300 font-medium' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}
