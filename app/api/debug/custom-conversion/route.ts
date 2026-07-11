import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const META = 'https://graph.facebook.com/v22.0';

// Diagnoses why conversion optimization fell back to Traffic: is a pixel connected,
// and does the "Spotify Click" custom conversion create (showing Meta's exact error)?
// /api/debug/custom-conversion?campaign=<id>
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const campaignId = req.nextUrl.searchParams.get('campaign');
  if (!campaignId) return NextResponse.json({ error: 'pass ?campaign=<id>' }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { user: { select: { metaConnection: { select: { pixelId: true, adAccountId: true, accessToken: true } } } } },
  });
  const conn = campaign?.user?.metaConnection;
  const pixelId = conn?.pixelId ?? null;
  const adAccountId = conn?.adAccountId ?? null;
  const token = conn?.accessToken ?? null;

  const out: Record<string, unknown> = { pixelId, hasAdAccount: !!adAccountId, hasToken: !!token };

  if (!pixelId) {
    out.diagnosis = 'NO PIXEL on the connection → falls back to Traffic. Reconnect Meta to provision a pixel.';
    return NextResponse.json(out);
  }
  if (!adAccountId || !token) {
    out.diagnosis = 'Missing ad account or token.';
    return NextResponse.json(out);
  }

  // Existing custom conversions
  const listRes = await fetch(`${META}/act_${adAccountId}/customconversions?fields=id,name&limit=100&access_token=${token}`);
  const list = await listRes.json();
  out.existing = list.error ? { error: list.error.message } : (list.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));

  // Attempt the exact create our worker does — surfaces the real error (rule format, etc.)
  const createRes = await fetch(`${META}/act_${adAccountId}/customconversions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Promohit Spotify Click',
      pixel_id: pixelId,
      custom_event_type: 'OTHER',
      rule: JSON.stringify({ and: [{ event: { eq: 'Lead' } }] }),
      access_token: token,
    }),
  });
  const created = await createRes.json();
  out.createAttempt = created.error
    ? { error: created.error.message, code: created.error.code, subcode: created.error.error_subcode }
    : { ok: true, id: created.id };
  return NextResponse.json(out);
}
