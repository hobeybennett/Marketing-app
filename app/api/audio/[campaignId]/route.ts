import { NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Serves a campaign's uploaded audio by (unguessable) campaign UUID — needed so
// fal's Whisper can fetch the track by URL for lyric transcription. Mirrors the
// video serving route's obscurity model.
export async function GET(_req: Request, { params }: { params: { campaignId: string } }) {
  const { campaignId } = params;
  if (campaignId.includes('..') || campaignId.includes('/')) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { audioUrl: true },
  });
  if (!campaign?.audioUrl || !existsSync(campaign.audioUrl)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { size } = statSync(campaign.audioUrl);
  const stream = createReadStream(campaign.audioUrl);
  const readable = Readable.toWeb(stream) as ReadableStream;
  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
