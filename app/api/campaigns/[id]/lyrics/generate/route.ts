import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

type Line = { text: string; start: number; end: number };

// Save the confirmed lyrics and kick off AI-video generation with them.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, aiVideoStatus: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Must be paid (on the lyrics step) — or a retry after a failed run.
  if (!['LYRICS', 'FAILED'].includes(campaign.aiVideoStatus)) {
    return NextResponse.json({ error: 'AI video not purchased for this campaign' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const raw: unknown = body?.lyrics;
  const lyrics: Line[] = Array.isArray(raw)
    ? raw
        .map((l: any) => ({ text: String(l?.text ?? '').trim(), start: Number(l?.start ?? 0), end: Number(l?.end ?? 0) }))
        .filter((l) => l.text && l.end > l.start)
    : [];

  await prisma.campaign.update({
    where: { id: params.id },
    // Empty lyrics is allowed (they can generate an AI background with no lyrics).
    data: { lyrics: lyrics.length ? lyrics : undefined, aiVideoStatus: 'GENERATING' },
  });
  await dispatchStage(params.id, 'AI_VIDEO_GEN');

  return NextResponse.json({ ok: true, lines: lyrics.length });
}
