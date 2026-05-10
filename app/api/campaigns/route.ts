import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';
import { mockStore, buildMockDetail } from '@/lib/mock-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  if (process.env.MOCK_MODE === 'true') {
    const campaigns = mockStore.list().map((c) => {
      const detail = buildMockDetail(c);
      return { ...detail, jobs: detail.jobs };
    });
    return NextResponse.json(campaigns);
  }

  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { jobs: true },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  try {
    console.log('[POST /api/campaigns] start');
    const formData = await req.formData();
    console.log('[POST /api/campaigns] formData parsed');

    const audioFile = formData.get('audio') as File | null;
    const coverArtUrl = formData.get('coverArtUrl') as string | null;

    console.log('[POST /api/campaigns] audioFile:', audioFile?.name, audioFile?.size, 'coverArtUrl:', coverArtUrl);

    if (!audioFile) return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    if (!coverArtUrl) return NextResponse.json({ error: 'coverArtUrl is required' }, { status: 400 });

    const schema = z.object({
      artistName: z.string().min(1),
      songTitle: z.string().min(1),
      autoLaunch: z.string().optional(),
    });

    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const { artistName, songTitle, autoLaunch } = parsed.data;

    if (process.env.MOCK_MODE === 'true') {
      const campaign = mockStore.create({
        artistName,
        songTitle,
        coverArtUrl,
        autoLaunch: autoLaunch === 'true',
      });
      return NextResponse.json(buildMockDetail(campaign), { status: 201 });
    }

    const campaignId = uuidv4();
    const uploadDir = process.env.UPLOAD_DIR || '/uploads';
    const campaignDir = path.join(uploadDir, campaignId);
    console.log('[POST /api/campaigns] creating dir:', campaignDir);
    await mkdir(campaignDir, { recursive: true });

    console.log('[POST /api/campaigns] writing audio...');
    const audioExt = audioFile.name.split('.').pop() || 'mp3';
    const audioPath = path.join(campaignDir, `audio.${audioExt}`);
    await writeFile(audioPath, Buffer.from(await audioFile.arrayBuffer()));
    console.log('[POST /api/campaigns] audio written');

    console.log('[POST /api/campaigns] downloading cover art...');
    const imgRes = await fetch(coverArtUrl);
    if (!imgRes.ok) throw new Error('Failed to download cover art from Spotify');
    const coverPath = path.join(campaignDir, 'cover.jpg');
    await writeFile(coverPath, Buffer.from(await imgRes.arrayBuffer()));
    console.log('[POST /api/campaigns] cover art written');

    console.log('[POST /api/campaigns] creating DB record...');
    const campaign = await prisma.campaign.create({
      data: {
        id: campaignId,
        artistName,
        songTitle,
        audioUrl: audioPath,
        coverArtUrl: coverPath,
        autoLaunch: autoLaunch === 'true',
        status: 'PROCESSING',
        jobs: {
          create: [
            { stage: 'SEGMENTATION', status: 'PENDING' },
            { stage: 'VIDEO_GEN', status: 'PENDING' },
            { stage: 'COPY_GEN', status: 'PENDING' },
            { stage: 'AUDIENCE_GEN', status: 'PENDING' },
            { stage: 'META_SETUP', status: 'PENDING' },
          ],
        },
      },
    });
    console.log('[POST /api/campaigns] DB record created:', campaign.id);

    console.log('[POST /api/campaigns] dispatching to queue...');
    await dispatchStage(campaignId, 'SEGMENTATION');
    console.log('[POST /api/campaigns] dispatched, returning response');

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/campaigns] ERROR:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
