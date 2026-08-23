import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildRenderPlan } from '@/lib/video-plan';

export const dynamic = 'force-dynamic';

// Owner-only: why did a campaign render fewer videos than planned?
// Partial render failures don't fail the stage, so a short count is otherwise
// invisible once the worker logs roll.
//
//   GET /api/debug/render-report              → most recent campaign
//   GET /api/debug/render-report?campaign=<id>
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('campaign');
  const campaign = id
    ? await prisma.campaign.findUnique({
        where: { id },
        include: { jobs: true, segments: true, creatives: true },
      })
    : await prisma.campaign.findFirst({
        where: { kind: 'CAMPAIGN' },
        orderBy: { createdAt: 'desc' },
        include: { jobs: true, segments: true, creatives: true },
      });

  if (!campaign) return NextResponse.json({ error: 'No campaign found' }, { status: 404 });

  const videoJob = campaign.jobs.find((j) => j.stage === 'VIDEO_GEN');
  const progress = (videoJob?.progress ?? null) as
    | { step?: string; current?: number; total?: number; sections?: number; failures?: string[] }
    | null;

  const planned = buildRenderPlan(campaign.segments.length).length;

  return NextResponse.json({
    campaign: `${campaign.artistName} — ${campaign.songTitle}`,
    campaignId: campaign.id,
    status: campaign.status,
    audioSections: campaign.segments.length,
    plannedNow: planned,
    // What the render actually recorded when it ran (config may have changed since).
    lastRender: progress
      ? {
          created: progress.current ?? null,
          planned: progress.total ?? null,
          sections: progress.sections ?? null,
          failures: progress.failures ?? [],
        }
      : 'No render report — this campaign rendered before failure reporting was added.',
    creativesInDb: campaign.creatives.length,
    videoJobStatus: videoJob?.status ?? 'none',
    videoJobError: videoJob?.error ?? null,
    note:
      'failures lists the exact reason each missing creative was skipped. If it is empty but created < ' +
      'planned, the shortfall happened before rendering (e.g. fewer audio sections than expected).',
  });
}
