import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Fallback for when the Stripe webhook doesn't fire (misconfigured secret, etc).
// Called by PaymentBanner when the user returns from checkout with ?session_id=xxx.
// Idempotent: uses StripeEvent table to prevent double-crediting if both
// the webhook and this endpoint run for the same session.
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: 'invalid session' }, { status: 400 });
  }

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ credited: false, reason: 'not paid' });
  }

  const userId = session.metadata?.userId;
  if (!userId) return NextResponse.json({ error: 'no userId in metadata' }, { status: 400 });

  const existing = await prisma.stripeEvent.findUnique({ where: { id: session.id } });
  if (existing) {
    return NextResponse.json({ credited: false, reason: 'already processed' });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { campaignCredits: { increment: 1 } } }),
    prisma.stripeEvent.create({ data: { id: session.id, userId } }),
  ]);

  return NextResponse.json({ credited: true });
}
