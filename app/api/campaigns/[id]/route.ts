import { NextRequest, NextResponse } from 'next/server';
import { rm } from 'fs/promises';
import path from 'path';
import { CampaignStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      jobs: true,
      segments: { orderBy: { index: 'asc' } },
      creatives: { include: { adCopies: true } },
      audiences: true,
    },
  });

  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { action } = await req.json();

  if (action === 'continue') {
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (campaign.status !== CampaignStatus.CONTENT_READY) {
      return NextResponse.json({ error: 'campaign must be CONTENT_READY to continue' }, { status: 400 });
    }

    await prisma.campaign.update({ where: { id: params.id }, data: { status: CampaignStatus.BUILDING } });
    await dispatchStage(params.id, 'COPY_GEN');
    return NextResponse.json({ status: 'building' });
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

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
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
