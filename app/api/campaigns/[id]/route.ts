import { NextRequest, NextResponse } from 'next/server';
import { rm } from 'fs/promises';
import path from 'path';
import { CampaignStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dispatchStage, campaignQueue } from '@/lib/queue';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();

  // Auto-recover: if a campaign is PROCESSING with no progress and the queue
  // doesn't actually have a job for it, requeue. This handles jobs lost from
  // Redis (deploys, eviction) and silent dispatch failures during campaign create.
  const stalenessCheck = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { status: true, updatedAt: true, createdAt: true, jobs: { select: { status: true, stage: true } } },
  });
  if (stalenessCheck && (stalenessCheck.status === 'PROCESSING' || stalenessCheck.status === 'PENDING')) {
    const anyRunning = stalenessCheck.jobs.some(j => j.status === 'RUNNING');
    const ageMs = Date.now() - new Date(stalenessCheck.createdAt).getTime();
    // Content stages in execution order. Re-kick the earliest one that isn't DONE —
    // each stage dispatches the next on success, so this resumes the whole chain.
    const CONTENT_ORDER = ['SEGMENTATION', 'COPY_GEN', 'AUDIENCE_GEN', 'VIDEO_GEN'] as const;
    const isDone = (stage: string) => stalenessCheck.jobs.some(j => j.stage === stage && j.status === 'DONE');
    const nextStage = CONTENT_ORDER.find(s => !isDone(s));
    // Fire after 60 seconds — if the worker had the job it would have set RUNNING by now
    if (!anyRunning && nextStage && ageMs > 60 * 1000) {
      // IDEMPOTENCY: check if there's already a job for this campaign in Redis
      // before dispatching another. Otherwise every page refresh creates a duplicate.
      let alreadyQueued = false;
      try {
        const waitingActive = await campaignQueue.getJobs(['waiting', 'active', 'delayed'], 0, 1000, false);
        alreadyQueued = waitingActive.some(j => (j.data as { campaignId?: string })?.campaignId === params.id);
      } catch (err) {
        console.error('[auto-recover] queue inspection failed:', err);
      }
      if (alreadyQueued) {
        console.log(`[auto-recover] skip — campaign ${params.id} already has a queued job`);
      } else {
        console.log(`[auto-recover] requeuing ${nextStage} for stuck campaign ${params.id} (age=${Math.round(ageMs/1000)}s)`);
        try {
          await prisma.campaignJob.updateMany({
            where: { campaignId: params.id, stage: nextStage },
            data: { status: 'PENDING', error: null },
          });
          await dispatchStage(params.id, nextStage);
        } catch (err) {
          console.error('[auto-recover] dispatch failed:', err);
        }
      }
    }
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      jobs: true,
      segments: { orderBy: { index: 'asc' } },
      creatives: { include: { adCopies: true } },
      adCopies: { where: { creativeId: null }, orderBy: { createdAt: 'asc' } },
      audiences: true,
      user: { select: { metaConnection: { select: { id: true, adAccountId: true } } } },
    },
  });

  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (campaign.userId && session?.user?.id !== campaign.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { user, ...rest } = campaign;
  return NextResponse.json({
    ...rest,
    hasMetaConnection: !!user?.metaConnection,
    adAccountId: user?.metaConnection?.adAccountId ?? null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  const body = await req.json();
  const { action } = body;

  // Verify ownership before allowing any mutation
  const campaignOwnerCheck = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });
  if (!campaignOwnerCheck) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaignOwnerCheck.userId && session?.user?.id !== campaignOwnerCheck.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Retry a stuck PROCESSING/PENDING campaign — re-runs the whole content chain from scratch
  if (action === 'retry-stuck') {
    await prisma.campaignJob.updateMany({
      where: { campaignId: params.id, stage: { in: ['SEGMENTATION', 'COPY_GEN', 'AUDIENCE_GEN', 'VIDEO_GEN'] } },
      data: { status: 'PENDING', error: null },
    });
    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: CampaignStatus.PROCESSING },
    });
    await dispatchStage(params.id, 'SEGMENTATION');
    return NextResponse.json({ status: 'retrying' });
  }

  if (action === 'select-copy') {
    const { copyId } = body;
    if (!copyId) return NextResponse.json({ error: 'copyId required' }, { status: 400 });
    await prisma.adCopy.updateMany({ where: { campaignId: params.id, creativeId: null }, data: { isSelected: false } });
    await prisma.adCopy.update({ where: { id: copyId }, data: { isSelected: true } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'launch') {
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (campaign.status !== CampaignStatus.READY) {
      return NextResponse.json({ error: 'campaign must be READY to launch' }, { status: 400 });
    }

    await prisma.campaign.update({ where: { id: params.id }, data: { status: CampaignStatus.LAUNCHING } });
    await dispatchStage(params.id, 'META_SETUP');
    return NextResponse.json({ status: 'launching' });
  }

  // Retry a stalled LAUNCHING campaign — re-dispatches META_SETUP (idempotent)
  if (action === 'retry-launch') {
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (campaign.status !== CampaignStatus.LAUNCHING) {
      return NextResponse.json({ error: 'campaign must be LAUNCHING to retry' }, { status: 400 });
    }

    // Reset job record and clear the partial Meta campaign ID so the stage
    // creates a fresh campaign rather than resuming a potentially broken one
    await prisma.campaignJob.updateMany({
      where: { campaignId: params.id, stage: 'META_SETUP' },
      data: { status: 'PENDING', error: null },
    });
    await prisma.campaign.update({
      where: { id: params.id },
      data: { metaCampaignId: null },
    });

    await dispatchStage(params.id, 'META_SETUP');
    return NextResponse.json({ status: 'launching' });
  }

  // Retry any FAILED campaign — re-dispatches the failed stage from scratch
  if (action === 'retry') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { jobs: true },
    });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (campaign.status !== CampaignStatus.FAILED) {
      return NextResponse.json({ error: 'campaign must be FAILED to retry' }, { status: 400 });
    }

    const failedJob = campaign.jobs.find(j => j.status === 'FAILED');
    if (!failedJob) return NextResponse.json({ error: 'no failed job found' }, { status: 400 });

    // All content stages live in the PROCESSING phase now; only META_SETUP is LAUNCHING.
    const stageStatusMap: Partial<Record<string, CampaignStatus>> = {
      SEGMENTATION: CampaignStatus.PROCESSING,
      COPY_GEN:     CampaignStatus.PROCESSING,
      AUDIENCE_GEN: CampaignStatus.PROCESSING,
      VIDEO_GEN:    CampaignStatus.PROCESSING,
      META_SETUP:   CampaignStatus.LAUNCHING,
    };
    const newStatus = stageStatusMap[failedJob.stage];
    if (!newStatus) return NextResponse.json({ error: 'unknown stage' }, { status: 400 });

    await prisma.campaignJob.updateMany({
      where: { campaignId: params.id, stage: failedJob.stage },
      data: { status: 'PENDING', error: null },
    });

    await prisma.campaign.update({
      where: { id: params.id },
      data: {
        status: newStatus,
        // Clear partial Meta state so META_SETUP starts fresh
        ...(failedJob.stage === 'META_SETUP' ? { metaCampaignId: null } : {}),
      },
    });

    await dispatchStage(params.id, failedJob.stage as any);
    return NextResponse.json({ status: 'retrying', stage: failedJob.stage });
  }

  if (action === 'pause') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { user: { include: { metaConnection: true } } },
    });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (campaign.status !== CampaignStatus.LIVE) {
      return NextResponse.json({ error: 'campaign must be LIVE to pause' }, { status: 400 });
    }

    if (campaign.metaCampaignId) {
      const token = campaign.user?.metaConnection?.accessToken ?? process.env.META_ACCESS_TOKEN;
      if (token) await metaStatusUpdate(campaign.metaCampaignId, token, 'PAUSED');
    }

    await prisma.campaign.update({ where: { id: params.id }, data: { status: CampaignStatus.PAUSED } });
    return NextResponse.json({ status: 'paused' });
  }

  if (action === 'resume') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { user: { include: { metaConnection: true } }, audiences: true },
    });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (campaign.status !== CampaignStatus.PAUSED) {
      return NextResponse.json({ error: 'campaign must be PAUSED to resume' }, { status: 400 });
    }

    if (campaign.metaCampaignId) {
      const token = campaign.user?.metaConnection?.accessToken ?? process.env.META_ACCESS_TOKEN;
      if (token) {
        await metaStatusUpdate(campaign.metaCampaignId, token, 'ACTIVE');
        for (const audience of campaign.audiences) {
          if (audience.metaAdSetId) await metaStatusUpdate(audience.metaAdSetId, token, 'ACTIVE');
        }
      }
    }

    await prisma.campaign.update({ where: { id: params.id }, data: { status: CampaignStatus.LIVE } });
    return NextResponse.json({ status: 'live' });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

async function metaStatusUpdate(objectId: string, token: string, status: string) {
  const res = await fetch(`https://graph.facebook.com/v22.0/${objectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(`Meta status update failed for ${objectId}: ${JSON.stringify(err?.error)}`);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true },
  });

  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (campaign.userId && campaign.userId !== session?.user?.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Delete child records in FK-safe order
  await prisma.adCopy.deleteMany({ where: { campaignId: params.id } });
  await prisma.videoCreative.deleteMany({ where: { campaignId: params.id } });
  await prisma.audience.deleteMany({ where: { campaignId: params.id } });
  await prisma.audioSegment.deleteMany({ where: { campaignId: params.id } });
  await prisma.campaignJob.deleteMany({ where: { campaignId: params.id } });
  await prisma.campaign.delete({ where: { id: params.id } });

  // Clean up uploaded files
  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const campaignDir = path.join(uploadDir, params.id);
  try {
    await rm(campaignDir, { recursive: true, force: true });
  } catch {
    // Non-fatal — directory may not exist
  }

  return NextResponse.json({ deleted: true });
}
