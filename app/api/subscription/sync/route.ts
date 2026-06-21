import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Re-syncs the user's subscription status directly from Stripe.
// Called from the Settings page when subscription status appears wrong.
export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionId: true, stripeCustomerId: true },
  });

  if (!user?.subscriptionId && !user?.stripeCustomerId) {
    return NextResponse.json({ status: null, message: 'No subscription on record' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Look up by subscriptionId first, fall back to latest subscription for the customer
  let subscription: Stripe.Subscription | null = null;
  if (user.subscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(user.subscriptionId);
    } catch {
      // subscription ID may be stale — fall through to customer lookup
    }
  }

  if (!subscription && user.stripeCustomerId) {
    const list = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 1,
      status: 'all',
    });
    subscription = list.data[0] ?? null;
  }

  if (!subscription) {
    return NextResponse.json({ status: null, message: 'No subscription found in Stripe' });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    },
  });

  return NextResponse.json({ status: subscription.status });
}
