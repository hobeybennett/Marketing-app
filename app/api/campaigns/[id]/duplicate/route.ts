import { NextResponse } from 'next/server';
import { copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Duplicate a campaign: copy the source inputs (audio, cover, background) and its
// settings into a fresh campaign, then run the whole pipeline again. Videos, copy,
// audiences and the Meta campaign are regenerated with the current code — so a
// duplicate picks up conversion optimization, the new video template, etc.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const source = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!source) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (source.userId && source.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const newId = uuidv4();
  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const srcDir = path.join(uploadDir, source.id);
  const newDir = path.join(uploadDir, newId);

  try {
    await mkdir(newDir, { recursive: true });
  } catch (err) {
    console.error(`[duplicate] storage unavailable at ${uploadDir}:`, err);
    return NextResponse.json(
      { error: 'Storage is temporarily unavailable — please try again in a moment.' },
      { status: 503 },
    );
  }

  const copyIfExists = async (name: string): Promise<boolean> => {
    const src = path.join(srcDir, name);
    if (!existsSync(src)) return false;
    await copyFile(src, path.join(newDir, name));
    return true;
  };

  // Audio is required to run the pipeline. If it was pruned by storage cleanup,
  // we can't duplicate — the source track is gone.
  const audioName = path.basename(source.audioUrl);
  if (!(await copyIfExists(audioName))) {
    return NextResponse.json(
      { error: 'This campaign\'s audio file is no longer stored, so it can\'t be duplicated. Create a new campaign and re-upload the track.' },
      { status: 409 },
    );
  }
  const coverName = path.basename(source.coverArtUrl);
  await copyIfExists(coverName);

  // Carry over the visual config, repointing any uploaded background to the new dir.
  const vc = (source.visualConfig as Record<string, unknown> | null) ?? null;
  let newVisualConfig = vc;
  if (vc && typeof vc.backgroundPath === 'string') {
    const bgName = path.basename(vc.backgroundPath);
    if (await copyIfExists(bgName)) {
      newVisualConfig = { ...vc, backgroundPath: path.join(newDir, bgName) };
    }
  }

  const created = await prisma.campaign.create({
    data: {
      id: newId,
      artistName: source.artistName,
      songTitle: source.songTitle,
      audioUrl: path.join(newDir, audioName),
      coverArtUrl: path.join(newDir, coverName),
      autoLaunch: source.autoLaunch,
      status: 'PROCESSING',
      dailyBudget: source.dailyBudget ?? undefined,
      visualConfig: newVisualConfig ? (newVisualConfig as Prisma.InputJsonValue) : undefined,
      clipDefinitions: (source.clipDefinitions as Prisma.InputJsonValue) ?? undefined,
      userId: source.userId ?? undefined,
      spotifyUrl: source.spotifyUrl ?? undefined,
      spotifyPlaylistUrl: source.spotifyPlaylistUrl ?? undefined,
      soundsLike: source.soundsLike,
      genre: source.genre ?? undefined,
      promoteType: source.promoteType,
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

  await dispatchStage(newId, 'SEGMENTATION');
  return NextResponse.json(created, { status: 201 });
}
