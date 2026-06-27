/**
 * Admin: nuke all your campaigns + drain the Redis queue.
 *
 * GET with ?confirm=yes from a mobile browser, or POST.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { rm } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED_EMAIL = 'hobeybennett@gmail.com';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('confirm') !== 'yes') {
    return NextResponse.json({
      error: 'Add ?confirm=yes to actually run the reset',
      example: '/api/admin/reset?confirm=yes',
    }, { status: 400 });
  }
  return runReset();
}

export async function POST() {
  return runReset();
}

async function runReset() {
  const session = await getServerSession();
  if (session?.user?.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const userId = session.user.id;
  if (!userId) return NextResponse.json({ error: 'no user id' }, { status: 400 });

  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    select: { id: true },
  });
  const ids = campaigns.map((c) => c.id);

  // Delete child records in FK-safe order
  await prisma.adCopy.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.videoCreative.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.audience.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.audioSegment.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.campaignJob.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.campaign.deleteMany({ where: { id: { in: ids } } });

  // Clean up uploaded files
  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  for (const id of ids) {
    await rm(path.join(uploadDir, id), { recursive: true, force: true }).catch(() => {});
  }

  // Drain the campaign queue completely
  let drainedJobs = 0;
  try {
    const conn = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 0,
      connectTimeout: 5000,
    });
    const queue = new Queue('campaign', { connection: conn });
    const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'completed', 'delayed');
    drainedJobs = counts.waiting + counts.active + counts.failed + counts.completed + counts.delayed;
    await queue.obliterate({ force: true });
    await queue.close();
    await conn.quit();
  } catch (err) {
    return NextResponse.json({
      campaignsDeleted: ids.length,
      queueError: String(err),
    }, { status: 207 });
  }

  return NextResponse.json({
    campaignsDeleted: ids.length,
    drainedJobs,
  });
}
