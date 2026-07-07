import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Shows smart-link click recording per platform with the latest timestamp, so we
// can tell whether tracking is live-but-low or frozen. /api/debug/clicks?campaign=<id>
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaignId = req.nextUrl.searchParams.get('campaign');
  if (!campaignId) return NextResponse.json({ error: 'pass ?campaign=<id>' }, { status: 400 });

  const byPlatform = await prisma.smartLinkClick.groupBy({
    by: ['platform'],
    where: { campaignId },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const latest = await prisma.smartLinkClick.findFirst({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    select: { platform: true, createdAt: true },
  });

  return NextResponse.json({
    total: byPlatform.reduce((s, p) => s + p._count._all, 0),
    byPlatform: byPlatform.map((p) => ({
      platform: p.platform,
      count: p._count._all,
      lastRecordedAt: p._max.createdAt?.toISOString() ?? null,
    })),
    latestClick: latest ? { platform: latest.platform, at: latest.createdAt.toISOString() } : null,
    serverTime: new Date().toISOString(),
  });
}
