import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string; filename: string } }
) {
  const { campaignId, filename } = params;

  // Sanitise — no path traversal
  if (
    campaignId.includes('..') || campaignId.includes('/') ||
    filename.includes('..') || filename.includes('/')
  ) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const filePath = path.join(uploadDir, campaignId, 'videos', filename);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const buf = await readFile(filePath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
