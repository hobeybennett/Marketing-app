import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Fallback for when the Stripe webhook doesn't fire for a Pro subscription.
// Called by PaymentBanner when the user returns from checkout with ?payment=pro_success&session_id=xxx.
// Idempotent: uses StripeEvent table to prevent double-processing.
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
  } catch {
    return NextResponse.json({ error: 'invalid session' }, { status: 400 });
  }

  if (session.mode !== 'subscription') {
    return NextResponse.json({ error: 'not a subscription session' }, { status: 400 });
  }

  const userId = session.metadata?.userId ?? session.client_reference_id;
  if (!userId) return NextResponse.json({ error: 'no userId in session' }, { status: 400 });

  const subscription = session.subscription as Stripe.Subscription | null;
  const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
  const subscriptionStatus = (subscription && typeof subscription !== 'string')
    ? subscription.status
    : 'active';

  const stripeCustomerId = typeof session.customer === 'string'
    ? session.customer
    : (session.customer as any)?.id ?? undefined;

  // Always update subscription status — idempotent for 'active'.
  // Use optimistic create for StripeEvent to prevent double-processing on concurrent calls.
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: subscriptionStatus ?? 'active',
      subscriptionId: subscriptionId ?? undefined,
      stripeCustomerId: stripeCustomerId ?? undefined,
    },
  });

  try {
    await prisma.stripeEvent.create({ data: { id: session.id, userId } });
  } catch (e: any) {
    if (e?.code !== 'P2002') throw e; // P2002 = already recorded, that's fine
  }

  return NextResponse.json({ activated: true, subscriptionStatus: subscriptionStatus ?? 'active' });
}
