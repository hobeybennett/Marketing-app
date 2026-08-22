import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SPOTIFY_CLICK_CONVERSION_NAME, SPOTIFY_CLICK_EVENT, META_API } from '@/lib/meta-campaign';

export const dynamic = 'force-dynamic';

// Owner-only. The "Promohit Spotify Click" custom conversion was created with a
// rule pinned to the old promohit.up.railway.app host, so campaigns launched
// since the domain move attribute nothing.
//
// Broadening that rule to match the PATH only ("/go/") would fix every campaign
// at once — old and new, live, with no relaunch and no loss of the conversion's
// history. Meta may treat conversion rules as immutable; this finds out safely.
//
//   GET /api/admin/fix-conversion-rule        → dry run: shows current rule + plan
//   GET /api/admin/fix-conversion-rule?go=1   → attempts the update, returns Meta's reply
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const conn = await prisma.metaConnection.findFirst({
    where: { user: { email: 'hobeybennett@gmail.com' } },
    select: { adAccountId: true, accessToken: true },
  });
  if (!conn?.adAccountId || !conn.accessToken) {
    return NextResponse.json({ error: 'No Meta connection' }, { status: 400 });
  }
  const { adAccountId, accessToken: token } = conn;

  const list = await (await fetch(
    `${META_API}/act_${adAccountId}/customconversions?fields=id,name,rule,custom_event_type&limit=100&access_token=${token}`
  )).json();
  if (list.error) return NextResponse.json({ error: list.error.message }, { status: 502 });

  const target = (list.data ?? []).find((c: { name: string }) => c.name === SPOTIFY_CLICK_CONVERSION_NAME);
  if (!target) {
    return NextResponse.json({ error: `No "${SPOTIFY_CLICK_CONVERSION_NAME}" custom conversion found` }, { status: 404 });
  }

  // Path-only: matches every host we have ever used or will use, so the old
  // campaigns keep attributing and the new ones start.
  const newRule = {
    and: [
      { event: { eq: SPOTIFY_CLICK_EVENT } },
      { or: [{ URL: { i_contains: '/go/' } }] },
    ],
  };

  if (req.nextUrl.searchParams.get('go') !== '1') {
    return NextResponse.json({
      dryRun: true,
      conversionId: target.id,
      currentRule: typeof target.rule === 'string' ? target.rule : JSON.stringify(target.rule),
      proposedRule: JSON.stringify(newRule),
      effect:
        'Broadens the URL match from the old railway host to any /go/ smart link. Fixes live ' +
        'campaigns in place — no relaunch, no new learning phase, conversion history kept.',
      howToApply: 'Re-open this URL with &go=1',
    });
  }

  const res = await fetch(`${META_API}/${target.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule: JSON.stringify(newRule), access_token: token }),
  });
  const body = await res.json().catch(() => null);

  // Read it back — Meta can return success while ignoring an immutable field.
  const after = await (await fetch(
    `${META_API}/${target.id}?fields=id,name,rule&access_token=${token}`
  )).json();
  const afterRule = typeof after.rule === 'string' ? after.rule : JSON.stringify(after.rule);
  const applied = afterRule?.includes('"/go/"') && !afterRule.includes('railway');

  return NextResponse.json({
    httpStatus: res.status,
    metaResponse: body,
    ruleAfter: afterRule,
    applied,
    verdict: applied
      ? 'Rule updated — live campaigns should start attributing within a few hours. No relaunch needed.'
      : 'Rule unchanged (Meta treats it as immutable). Relaunch instead: new campaigns now build their own correctly-scoped conversion.',
  });
}
