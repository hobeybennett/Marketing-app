import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const CREDIT_PAYMENT_LINK = 'https://buy.stripe.com/eVq9AU1DIdr021r7nh28801';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });

  const url = new URL(CREDIT_PAYMENT_LINK);
  url.searchParams.set('client_reference_id', session.user.id);
  if (user?.email) url.searchParams.set('prefilled_email', user.email);

  return NextResponse.redirect(url.toString());
}
