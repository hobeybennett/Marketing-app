import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { transcribeAudio } from '@/lib/fal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Owner-only: transcribe a campaign's audio and return the timed lyric chunks, so
// we can judge whether auto-transcription is accurate enough for lyric videos
// BEFORE building the rendering.
//   /api/debug/transcribe?campaign=<id>   (defaults to most recent)
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaignId = req.nextUrl.searchParams.get('campaign');
  const campaign = campaignId
    ? await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, songTitle: true, audioUrl: true } })
    : await prisma.campaign.findFirst({
        where: { user: { email: 'hobeybennett@gmail.com' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, songTitle: true, audioUrl: true },
      });

  if (!campaign) return NextResponse.json({ error: 'No campaign found' }, { status: 404 });
  if (!campaign.audioUrl) return NextResponse.json({ error: 'Campaign has no audio' }, { status: 400 });

  const base = process.env.NEXTAUTH_URL || 'https://promohit.marketing';
  const audioUrl = `${base}/api/audio/${campaign.id}`;

  const result = await transcribeAudio(audioUrl);
  if (!result) {
    return NextResponse.json({
      campaign: campaign.songTitle,
      audioUrl,
      error: 'Transcription failed — check worker/web logs for [fal-whisper] and confirm the audio URL is reachable.',
    });
  }

  return NextResponse.json({
    campaign: campaign.songTitle,
    audioUrl,
    lineCount: result.chunks.length,
    fullText: result.text,
    lines: result.chunks.map((c) => ({ t: `${c.start.toFixed(1)}–${c.end.toFixed(1)}s`, text: c.text })),
    note: 'Read the lines: are the lyrics accurate and the timing sensible? That decides auto vs paste-lyrics.',
  });
}
