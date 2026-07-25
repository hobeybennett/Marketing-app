import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { transcribeAudio } from '@/lib/fal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Auto-transcribe the campaign's audio into timed lyric lines for the editor.
// Returns the draft lines (not saved — the artist edits, then saves via generate).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const base = process.env.NEXTAUTH_URL || 'https://promohit.marketing';
  const result = await transcribeAudio(`${base}/api/audio/${campaign.id}`);
  if (!result) {
    return NextResponse.json({ error: 'Could not scan the audio — try again or paste your lyrics.' }, { status: 502 });
  }
  return NextResponse.json({ lines: result.chunks });
}
