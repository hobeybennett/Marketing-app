import { NextRequest, NextResponse } from 'next/server';
import { CampaignStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';
import { mockStore, buildMockDetail } from '@/lib/mock-store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const campaign = mockStore.get(params.id);
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(buildMockDetail(campaign));
  }

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

  if (process.env.MOCK_MODE === 'true') {
    const campaign = mockStore.get(params.id);
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (action === 'continue') {
      mockStore.startCampaignPhase(params.id);
      return NextResponse.json({ status: 'building' });
    }
    if (action === 'launch') {
      mockStore.launch(params.id);
      return NextResponse.json({ status: 'launching' });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }

  if (action === 'approve') {
    const campaign = await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'READY' },
    });
    return NextResponse.json(campaign);
  }

  if (action === 'continue') {
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (campaign.status !== CampaignStatus.CONTENT_READY) {
      return NextResponse.json({ error: 'campaign must be in CONTENT_READY status to continue' }, { status: 400 });
    }

    await prisma.campaign.update({ where: { id: params.id }, data: { status: CampaignStatus.BUILDING } });
    await dispatchStage(params.id, 'COPY_GEN');
    return NextResponse.json({ status: 'building' });
  }

  if (action === 'launch') {
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (campaign.status !== 'READY') {
      return NextResponse.json({ error: 'campaign must be in READY status to launch' }, { status: 400 });
    }

    await prisma.campaign.update({ where: { id: params.id }, data: { status: 'LAUNCHING' } });
    await dispatchStage(params.id, 'META_SETUP');
    return NextResponse.json({ status: 'launching' });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
