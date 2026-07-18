import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// Owner-only: trigger AI-video generation on a campaign WITHOUT paying, so the
// fal.ai params + composited look can be tuned quickly. Same path as a real
// purchase minus Stripe.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await prisma.campaign.update({
    where: { id: params.id },
    data: { aiVideoStatus: 'PAID', aiVideoChoiceUrl: null },
  });
  await dispatchStage(params.id, 'AI_VIDEO_GEN');

  return NextResponse.json({ ok: true });
}
