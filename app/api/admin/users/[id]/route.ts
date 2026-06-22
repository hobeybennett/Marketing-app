import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

const ADMIN_EMAIL = 'hobeybennett@gmail.com';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { action } = await req.json();

  if (action === 'set-pro') {
    const user = await prisma.user.update({
      where: { id: params.id },
      data: { subscriptionStatus: 'active' },
      select: { subscriptionStatus: true, campaignCredits: true },
    });
    return NextResponse.json({ ok: true, ...user });
  }

  if (action === 'set-free') {
    const user = await prisma.user.update({
      where: { id: params.id },
      data: { subscriptionStatus: null },
      select: { subscriptionStatus: true, campaignCredits: true },
    });
    return NextResponse.json({ ok: true, ...user });
  }

  if (action === 'add-credit') {
    const user = await prisma.user.update({
      where: { id: params.id },
      data: { campaignCredits: { increment: 1 } },
      select: { subscriptionStatus: true, campaignCredits: true },
    });
    return NextResponse.json({ ok: true, ...user });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
