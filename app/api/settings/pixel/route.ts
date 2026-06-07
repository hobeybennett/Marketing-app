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
