import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // ── One-time payment or subscription checkout completed ──────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
    if (!userId) return NextResponse.json({ received: true });

    // Store Stripe customer ID for future checkouts
    if (session.customer) {
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: session.customer as string },
      }).catch(() => {});
    }

    if (session.mode === 'payment' && session.payment_status === 'paid') {
      try {
        await prisma.$transaction([
          prisma.user.update({ where: { id: userId }, data: { campaignCredits: { increment: 1 } } }),
          prisma.stripeEvent.create({ data: { id: session.id, userId } }),
        ]);
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e; // P2002 = unique constraint — already processed
      }
    }

    if (session.mode === 'subscription' && session.subscription) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionId: session.subscription as string,
          subscriptionStatus: 'active',
        },
      });
    }
  }

  // ── Subscription status changes (renewals, cancellations, payment failure) ─
  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription;
    await prisma.user.updateMany({
      where: { subscriptionId: sub.id },
      data: { subscriptionStatus: sub.status },
    });
  }

  return NextResponse.json({ received: true });
}
