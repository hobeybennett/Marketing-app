import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

  // Land on the prompt step (same as a real purchase) so the owner tests the full
  // prompt → generate flow.
  await prisma.campaign.update({
    where: { id: params.id },
    data: { aiVideoStatus: 'PROMPT', aiVideoChoiceUrl: null },
  });

  return NextResponse.json({ ok: true });
}
