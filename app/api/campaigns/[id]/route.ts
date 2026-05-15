import { NextRequest, NextResponse } from 'next/server';
import { CampaignStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

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
