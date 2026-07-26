import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// Save the artist's (optional) background prompt and kick off AI-video generation.
// The prompt describes the cinematic AI background; empty is fine — we fall back to
// an auto-built prompt from the track's genre/mood.
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
  // Must be paid (on the prompt step) — or a retry after a failed run.
  if (!['PROMPT', 'FAILED'].includes(campaign.aiVideoStatus)) {
    return NextResponse.json({ error: 'AI video not purchased for this campaign' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? '').trim().slice(0, 500);

  await prisma.campaign.update({
    where: { id: params.id },
    data: { aiVideoPrompt: prompt || null, aiVideoStatus: 'GENERATING' },
  });
  await dispatchStage(params.id, 'AI_VIDEO_GEN');

  return NextResponse.json({ ok: true });
}
