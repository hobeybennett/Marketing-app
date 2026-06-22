import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'hobeybennett@gmail.com';

export async function GET() {
  const session = await getServerSession();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      createdAt: true,
      subscriptionStatus: true,
      campaignCredits: true,
      subscriptionId: true,
      _count: { select: { campaigns: true } },
    },
  });

  return NextResponse.json(users);
}
