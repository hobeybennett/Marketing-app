import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { jobs: true },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const audioFile = formData.get('audio') as File | null;
  const coverArtUrl = formData.get('coverArtUrl') as string | null;

  if (!audioFile) {
    return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
  }
  if (!coverArtUrl) {
    return NextResponse.json({ error: 'coverArtUrl is required' }, { status: 400 });
  }

  const schema = z.object({
    artistName: z.string().min(1),
    songTitle: z.string().min(1),
    autoLaunch: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const campaignId = uuidv4();
  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const campaignDir = path.join(uploadDir, campaignId);
  await mkdir(campaignDir, { recursive: true });

  const audioExt = audioFile.name.split('.').pop() || 'mp3';
  const audioPath = path.join(campaignDir, `audio.${audioExt}`);
  await writeFile(audioPath, Buffer.from(await audioFile.arrayBuffer()));

  const imgRes = await fetch(coverArtUrl);
  if (!imgRes.ok) throw new Error('Failed to download cover art from Spotify');
  const coverPath = path.join(campaignDir, 'cover.jpg');
  await writeFile(coverPath, Buffer.from(await imgRes.arrayBuffer()));

  const { artistName, songTitle, autoLaunch } = parsed.data;

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

  await dispatchStage(campaignId, 'SEGMENTATION');

  return NextResponse.json(campaign, { status: 201 });
}
