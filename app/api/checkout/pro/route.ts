import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PRO_PAYMENT_LINK = 'https://buy.stripe.com/4gMbJ23LQ4Uu35vbDx28802';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, email: true },
  });

  // Already subscribed — send to manage portal instead
  if (user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing') {
    return NextResponse.redirect(new URL('/settings', req.url));
  }

  const url = new URL(PRO_PAYMENT_LINK);
  url.searchParams.set('client_reference_id', session.user.id);
  if (user?.email) url.searchParams.set('prefilled_email', user.email);

  return NextResponse.redirect(url.toString());
}
