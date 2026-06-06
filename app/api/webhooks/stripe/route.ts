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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (userId && session.payment_status === 'paid') {
      const existing = await prisma.stripeEvent.findUnique({ where: { id: session.id } });
      if (!existing) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: userId }, data: { campaignCredits: { increment: 1 } } }),
          prisma.stripeEvent.create({ data: { id: session.id, userId } }),
        ]);
      }
    }
  }

  return NextResponse.json({ received: true });
}
