import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { adAccountId, pageId } = await req.json();

  const conn = await prisma.metaConnection.findUnique({ where: { userId: session.user.id } });
  if (!conn) return NextResponse.json({ error: 'No Meta connection found' }, { status: 404 });

  const accounts = (conn.availableAdAccounts as any[]) ?? [];
  const pages = (conn.availablePages as any[]) ?? [];

  const updates: Record<string, unknown> = {};

  if (adAccountId) {
    const account = accounts.find((a) => a.id === adAccountId);
    if (!account) return NextResponse.json({ error: 'Ad account not found' }, { status: 400 });
    updates.adAccountId = account.id;
    updates.adAccountName = account.name;
  }

  if (pageId) {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 400 });
    updates.pageId = page.id;
    updates.pageName = page.name;
    updates.pageAccessToken = page.accessToken ?? null;
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await prisma.metaConnection.update({
    where: { userId: session.user.id },
    data: updates,
  });

  return NextResponse.json({ ok: true });
}
