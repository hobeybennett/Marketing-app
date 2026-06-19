import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string; filename: string } }
) {
  const { campaignId, filename } = params;

  if (
    campaignId.includes('..') || campaignId.includes('/') ||
    filename.includes('..') || filename.includes('/')
  ) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const thumbPath = path.join(uploadDir, campaignId, 'videos', filename);

  // Fall back to cover art if thumb not generated yet
  const coverPath = path.join(uploadDir, campaignId, 'cover.jpg');

  const filePath = existsSync(thumbPath) ? thumbPath : existsSync(coverPath) ? coverPath : null;
  if (!filePath) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const buf = await readFile(filePath);
  const { size } = await stat(filePath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(size),
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
