import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { jobs: true },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const userId = session?.user?.id ?? null;

    if (userId) {
      const userCampaignCount = await prisma.campaign.count({
        where: { userId, status: { not: 'FAILED' } },
      });
      if (userCampaignCount >= 1) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { campaignCredits: true, subscriptionStatus: true },
        });
        const isPro = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
        if (!isPro) {
          if (!user || user.campaignCredits <= 0) {
            return NextResponse.json({ error: 'payment_required' }, { status: 402 });
          }
          await prisma.user.update({
            where: { id: userId },
            data: { campaignCredits: { decrement: 1 } },
          });
        }
      }
    }

    const formData = await req.formData();

    const audioFile = formData.get('audio') as File | null;
    const coverArtUrl = formData.get('coverArtUrl') as string | null;

    if (!audioFile) return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    if (!coverArtUrl) return NextResponse.json({ error: 'coverArtUrl is required' }, { status: 400 });

    const schema = z.object({
      artistName: z.string().min(1),
      songTitle: z.string().min(1),
      autoLaunch: z.string().optional(),
      spotifyUrl: z.string().url().optional().or(z.literal('')),
      spotifyPlaylistUrl: z.string().url().optional().or(z.literal('')),
      soundsLike: z.string().optional(),
    });

    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

    const { artistName, songTitle, autoLaunch, spotifyUrl, spotifyPlaylistUrl, soundsLike } = parsed.data;
    const soundsLikeList = soundsLike
      ? soundsLike.split(',').map(s => s.trim()).filter(Boolean)
      : [];

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

    let visualConfigObj: Record<string, unknown> | null = null;
    const visualConfigStr = formData.get('visualConfig') as string | null;
    if (visualConfigStr) visualConfigObj = JSON.parse(visualConfigStr);

    const bgFile = formData.get('background') as File | null;
    if (bgFile && bgFile.size > 0 && visualConfigObj) {
      const bgExt = bgFile.name.split('.').pop() || 'jpg';
      const bgPath = path.join(campaignDir, `background.${bgExt}`);
      await writeFile(bgPath, Buffer.from(await bgFile.arrayBuffer()));
      visualConfigObj.backgroundPath = bgPath;
    }

    const clipDefinitionsStr = formData.get('clips') as string | null;
    const clipDefinitions = clipDefinitionsStr ? JSON.parse(clipDefinitionsStr) : null;

    const campaign = await prisma.campaign.create({
      data: {
        id: campaignId,
        artistName,
        songTitle,
        audioUrl: audioPath,
        coverArtUrl: coverPath,
        autoLaunch: autoLaunch === 'true',
        status: 'PROCESSING',
        visualConfig: visualConfigObj ? (visualConfigObj as Prisma.InputJsonValue) : undefined,
        clipDefinitions: clipDefinitions ? (clipDefinitions as Prisma.InputJsonValue) : undefined,
        userId: userId ?? undefined,
        spotifyUrl: spotifyUrl || undefined,
        spotifyPlaylistUrl: spotifyPlaylistUrl || undefined,
        soundsLike: soundsLikeList,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/campaigns]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
