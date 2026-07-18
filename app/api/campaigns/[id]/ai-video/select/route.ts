import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// User picks one of the 3 generated AI backgrounds → re-render the creatives with
// it. { choiceUrl } must be one of the stored options.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { choiceUrl } = await req.json().catch(() => ({}));
  if (!choiceUrl || typeof choiceUrl !== 'string') {
    return NextResponse.json({ error: 'choiceUrl required' }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, aiVideoOptions: true, aiVideoStatus: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const options = Array.isArray(campaign.aiVideoOptions) ? (campaign.aiVideoOptions as string[]) : [];
  if (!options.includes(choiceUrl)) {
    return NextResponse.json({ error: 'choice is not one of the generated options' }, { status: 400 });
  }

  await prisma.campaign.update({
    where: { id: params.id },
    data: { aiVideoChoiceUrl: choiceUrl, aiVideoStatus: 'SELECTED', status: 'PROCESSING' },
  });

  // Re-render the 5 creatives with the chosen AI background.
  await dispatchStage(params.id, 'VIDEO_GEN');

  return NextResponse.json({ ok: true });
}
