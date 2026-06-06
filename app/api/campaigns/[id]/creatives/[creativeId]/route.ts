import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; creativeId: string } },
) {
  const { creativeId } = params;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = body;
  if (action !== 'pause' && action !== 'resume') {
    return NextResponse.json({ error: 'action must be "pause" or "resume"' }, { status: 400 });
  }

  const creative = await prisma.videoCreative.findUnique({
    where: { id: creativeId },
    include: {
      campaign: {
        include: {
          user: {
            include: { metaConnection: true },
          },
        },
      },
    },
  });

  if (!creative) {
    return NextResponse.json({ error: 'Creative not found' }, { status: 404 });
  }

  const metaStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE';

  const token =
    creative.campaign.user?.metaConnection?.accessToken ??
    process.env.META_ACCESS_TOKEN;

  if (creative.metaAdId && token) {
    const formBody = new URLSearchParams({
      access_token: token,
      status: metaStatus,
    }).toString();

    const metaRes = await fetch(
      `https://graph.facebook.com/v22.0/${creative.metaAdId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      },
    );

    if (!metaRes.ok) {
      let errMsg = 'Meta API error';
      try {
        const errBody = await metaRes.json() as { error?: { message?: string } };
        errMsg = errBody.error?.message ?? errMsg;
      } catch {
        // ignore parse error
      }
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }
  }

  const updated = await prisma.videoCreative.update({
    where: { id: creativeId },
    data: { adStatus: metaStatus },
  });

  return NextResponse.json({ adStatus: updated.adStatus });
}
