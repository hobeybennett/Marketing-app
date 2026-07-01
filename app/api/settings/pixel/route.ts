import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { pixelId } = await req.json();
  const safe = String(pixelId ?? '').replace(/\D/g, '');
  await prisma.metaConnection.update({
    where: { userId: session.user.id },
    data: { pixelId: safe || null, pixelName: null },
  });
  return NextResponse.json({ ok: true });
}

// Auto-set-up conversion tracking: use an existing ad-account Pixel or create one.
// For artists who connected before pixel auto-provisioning existed.
export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conn = await prisma.metaConnection.findUnique({ where: { userId: session.user.id } });
  if (!conn?.accessToken || !conn.adAccountId) {
    return NextResponse.json({ error: 'Connect your Meta account first.' }, { status: 400 });
  }
  if (conn.pixelId) return NextResponse.json({ ok: true, pixelId: conn.pixelId });

  const acct = conn.adAccountId;
  let pixelId: string | null = null;
  let pixelName: string | null = null;

  const existingRes = await fetch(
    `https://graph.facebook.com/v22.0/act_${acct}/adspixels?fields=id,name&limit=1&access_token=${conn.accessToken}`
  );
  const existing = await existingRes.json();
  if (!existing.error && existing.data?.[0]) {
    pixelId = existing.data[0].id;
    pixelName = existing.data[0].name ?? null;
  } else {
    const createRes = await fetch(`https://graph.facebook.com/v22.0/act_${acct}/adspixels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Promohit Conversions', access_token: conn.accessToken }),
    });
    const created = await createRes.json();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 });
    pixelId = created.id;
    pixelName = 'Promohit Conversions';
  }

  await prisma.metaConnection.update({
    where: { userId: session.user.id },
    data: { pixelId, pixelName },
  });
  return NextResponse.json({ ok: true, pixelId });
}
