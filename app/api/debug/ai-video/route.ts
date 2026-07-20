import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { dispatchStage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// Owner-only, UI-independent way to test AI video generation:
//   /api/debug/ai-video                 → status of most recent campaign
//   /api/debug/ai-video?campaign=<id>   → that campaign
//   /api/debug/ai-video?...&go=1        → trigger generation (free)
// Poll it: after go=1, reopen without go=1 to see the generated option URLs.
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const campaignId = req.nextUrl.searchParams.get('campaign');
  const go = req.nextUrl.searchParams.get('go') === '1';
  const preview = req.nextUrl.searchParams.get('preview') === '1';

  const campaign = campaignId
    ? await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, songTitle: true, status: true, aiVideoStatus: true, aiVideoOptions: true, aiVideoChoiceUrl: true },
      })
    : await prisma.campaign.findFirst({
        where: { user: { email: 'hobeybennett@gmail.com' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, songTitle: true, status: true, aiVideoStatus: true, aiVideoOptions: true, aiVideoChoiceUrl: true },
      });

  if (!campaign) return NextResponse.json({ error: 'No campaign found' }, { status: 404 });

  const out: Record<string, unknown> = {
    campaignId: campaign.id,
    song: campaign.songTitle,
    campaignStatus: campaign.status,
    aiVideoStatus: campaign.aiVideoStatus,
    aiVideoOptions: campaign.aiVideoOptions ?? null,
    aiVideoChoiceUrl: campaign.aiVideoChoiceUrl ?? null,
    falKeySetOnWeb: !!process.env.FAL_KEY,
    videoModel: process.env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v1.6/standard/text-to-video (default)',
  };

  const base = process.env.NEXTAUTH_URL || 'https://promohit.marketing';

  if (go) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { aiVideoStatus: 'PAID', aiVideoChoiceUrl: null },
    });
    await dispatchStage(campaign.id, 'AI_VIDEO_GEN');
    out.triggered = true;
    out.note = 'Generation dispatched. Wait ~1-2 min, then reopen this URL WITHOUT &go=1 to see aiVideoOptions.';
  } else if (preview) {
    // Render one composited sample creative (first AI option) — doesn't touch the
    // live campaign. Viewable at the previewUrl once done (~30-60s).
    await dispatchStage(campaign.id, 'AI_VIDEO_PREVIEW');
    out.previewTriggered = true;
    out.previewUrl = `${base}/api/videos/${campaign.id}/preview.mp4`;
    out.note = 'Preview render dispatched. Wait ~30-60s, then open previewUrl to see the composited 9:16 ad.';
  } else {
    out.note = campaign.aiVideoStatus === 'READY'
      ? 'Ready — open the aiVideoOptions URLs to view the 3 clips.'
      : campaign.aiVideoStatus === 'GENERATING' || campaign.aiVideoStatus === 'PAID'
      ? 'Still generating — reopen in a minute.'
      : 'Add &go=1 to this URL to trigger generation.';
  }

  return NextResponse.json(out);
}
