import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

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
  const body = await req.json();
  const { action } = body;

  if (action === 'approve') {
    const campaign = await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'APPROVED' },
    });
    return NextResponse.json(campaign);
  }

  if (action === 'launch') {
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (campaign.status !== 'READY') {
      return NextResponse.json({ error: 'campaign must be in READY status to launch' }, { status: 400 });
    }

    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'LAUNCHING' },
    });

    await dispatchStage(params.id, 'META_SETUP');
    return NextResponse.json({ status: 'launching' });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
