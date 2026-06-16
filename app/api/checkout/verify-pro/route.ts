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

  const userId = session.metadata?.userId;
  if (!userId) return NextResponse.json({ error: 'no userId in metadata' }, { status: 400 });

  const existing = await prisma.stripeEvent.findUnique({ where: { id: session.id } });
  if (existing) {
    return NextResponse.json({ activated: false, reason: 'already processed' });
  }

  const subscription = session.subscription as Stripe.Subscription | null;
  const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
  const subscriptionStatus = subscription && typeof subscription !== 'string'
    ? subscription.status
    : 'active';

  const stripeCustomerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? undefined;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: subscriptionStatus ?? 'active',
        subscriptionId: subscriptionId ?? undefined,
        stripeCustomerId: stripeCustomerId ?? undefined,
      },
    }),
    prisma.stripeEvent.create({ data: { id: session.id, userId } }),
  ]);

  return NextResponse.json({ activated: true });
}
