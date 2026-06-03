import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { dispatchStage } from '@/lib/queue';
import { detectFatigue } from '@/lib/creative-fatigue';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, status: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Load recent insight data
  const insights = await prisma.adInsight.findMany({
    where: { campaignId: params.id },
    orderBy: { date: 'desc' },
  });

  const fatigueReport = detectFatigue(insights);

  if (fatigueReport.hasFatigue) {
    // Trigger creative regeneration
    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'PROCESSING' },
    });
    await dispatchStage(params.id, 'VIDEO_GEN');

    return NextResponse.json({
      triggered: true,
      reason: fatigueReport.reason,
      affectedCreatives: fatigueReport.affectedCreatives,
    });
  }

  return NextResponse.json({
    triggered: false,
    reason: fatigueReport.reason,
    affectedCreatives: [],
  });
}
