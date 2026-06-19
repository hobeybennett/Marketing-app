import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync, existsSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
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
  const filePath = path.join(uploadDir, campaignId, 'videos', filename);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { size: fileSize } = statSync(filePath);
  const rangeHeader = req.headers.get('range');

  if (rangeHeader) {
    const [rawStart, rawEnd] = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(rawStart, 10);
    const end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const stream = createReadStream(filePath, { start, end });
    const readable = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(readable, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  const stream = createReadStream(filePath);
  const readable = Readable.toWeb(stream) as ReadableStream;
  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
