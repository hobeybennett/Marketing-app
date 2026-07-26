import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

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
  // Primary path: the artist types/pastes plain lyric lines. We store them as a
  // simple string[] and evenly distribute them per clip at render time (music
  // transcription is unreliable, so we no longer depend on per-line timestamps).
  // Tolerate the legacy shape ({ lyrics: [{ text }] }) for older clients.
  const rawLines: unknown = body?.lines ?? (Array.isArray(body?.lyrics) ? body.lyrics.map((l: any) => l?.text) : undefined);
  const lines: string[] = Array.isArray(rawLines)
    ? rawLines.map((l: any) => String(l ?? '').trim()).filter(Boolean)
    : [];

  await prisma.campaign.update({
    where: { id: params.id },
    // Empty lyrics is allowed (they can generate an AI background with no lyrics).
    data: { lyrics: lines.length ? lines : undefined, aiVideoStatus: 'GENERATING' },
  });
  await dispatchStage(params.id, 'AI_VIDEO_GEN');

  return NextResponse.json({ ok: true, lines: lines.length });
}
