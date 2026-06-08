import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return NextResponse.redirect(new URL('/settings?billing_error=no_customer', req.url));
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl}/settings`,
  });

  return NextResponse.redirect(portalSession.url);
}
