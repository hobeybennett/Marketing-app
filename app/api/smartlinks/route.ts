import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Standalone smart links. These are Campaign rows with kind = SMART_LINK: same
// landing page (/go/{id}), same click tracking and stats — just created without
// uploading audio, and never dispatched into the ad pipeline.

const Body = z.object({
  artistName: z.string().trim().min(1).max(120),
  songTitle: z.string().trim().min(1).max(200),
  coverArtUrl: z.string().url(),
  spotifyUrl: z.string().url().optional().or(z.literal('')),
  spotifyPlaylistUrl: z.string().url().optional().or(z.literal('')),
  promoteType: z.enum(['track', 'playlist']).optional().default('track'),
});

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const links = await prisma.campaign.findMany({
    where: { userId: session.user.id, kind: 'SMART_LINK' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      artistName: true,
      songTitle: true,
      spotifyUrl: true,
      spotifyPlaylistUrl: true,
      promoteType: true,
      createdAt: true,
      _count: { select: { smartLinkClicks: true } },
    },
  });
  return NextResponse.json(links);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const { artistName, songTitle, coverArtUrl, spotifyUrl, spotifyPlaylistUrl, promoteType } = parsed.data;
  if (!spotifyUrl && !spotifyPlaylistUrl) {
    return NextResponse.json({ error: 'Add at least one Spotify link' }, { status: 400 });
  }

  const id = uuidv4();
  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const dir = path.join(uploadDir, id);

  // Save the artwork as cover.jpg so the existing /api/covers/{id} route serves
  // it — the landing page then works with no changes at all.
  try {
    await mkdir(dir, { recursive: true });
    const imgRes = await fetch(coverArtUrl);
    if (!imgRes.ok) throw new Error(`artwork fetch failed: ${imgRes.status}`);
    await writeFile(path.join(dir, 'cover.jpg'), Buffer.from(await imgRes.arrayBuffer()));
  } catch (err) {
    console.error('[smartlinks] artwork save failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not save the artwork — try again.' }, { status: 502 });
  }

  await prisma.campaign.create({
    data: {
      id,
      kind: 'SMART_LINK',
      userId: session.user.id,
      artistName,
      songTitle,
      coverArtUrl: path.join(dir, 'cover.jpg'),
      audioUrl: null,
      // Terminal state: no jobs are created and nothing is ever dispatched.
      status: 'READY',
      promoteType,
      spotifyUrl: spotifyUrl || null,
      spotifyPlaylistUrl: spotifyPlaylistUrl || null,
      soundsLike: [],
    },
  });

  const base = process.env.NEXTAUTH_URL || 'https://promohit.marketing';
  return NextResponse.json({ id, url: `${base}/go/${id}` }, { status: 201 });
}
