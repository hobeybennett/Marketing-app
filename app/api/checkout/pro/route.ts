import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, email: true, subscriptionStatus: true },
  });

  // Already subscribed — send to manage portal instead
  if (user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing') {
    return NextResponse.redirect(new URL('/settings', req.url));
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: user?.stripeCustomerId ?? undefined,
    customer_email: !user?.stripeCustomerId ? (user?.email ?? undefined) : undefined,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Promohit Pro',
          description: 'Unlimited campaigns every month',
        },
        unit_amount: 999,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: `${appUrl}/campaigns?payment=pro_success`,
    cancel_url: `${appUrl}/campaigns?payment=cancelled`,
    metadata: { userId: session.user.id },
  });

  return NextResponse.redirect(checkoutSession.url!);
}
