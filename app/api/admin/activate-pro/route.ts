import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Temporary one-use admin endpoint — delete after use
const ALLOWED_EMAIL = 'hobeybennett@gmail.com';

export async function POST() {
  const session = await getServerSession();
  if (session?.user?.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const user = await prisma.user.update({
    where: { email: ALLOWED_EMAIL },
    data: { subscriptionStatus: 'active' },
    select: { email: true, subscriptionStatus: true },
  });

  return NextResponse.json({ ok: true, email: user.email, subscriptionStatus: user.subscriptionStatus });
}
