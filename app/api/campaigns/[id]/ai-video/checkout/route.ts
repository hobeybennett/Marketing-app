import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Create a $1.99 AUD Stripe Checkout Session for the AI-video add-on, tied to this
// campaign via metadata. Inline price_data means no pre-created Stripe product is
// needed. The webhook flips aiVideoStatus → PAID and kicks off generation.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, aiVideoStatus: true },
  });
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (campaign.userId && campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (campaign.aiVideoStatus && !['NONE', 'FAILED'].includes(campaign.aiVideoStatus)) {
    return NextResponse.json({ error: 'AI video already purchased for this campaign' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, stripeCustomerId: true },
  });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const base = process.env.NEXTAUTH_URL || 'https://promohit.marketing';

  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'aud',
          product_data: {
            name: 'AI Video — Promohit',
            description: '3 AI-generated video backgrounds to choose from for your campaign',
          },
          unit_amount: 199,
        },
        quantity: 1,
      },
    ],
    metadata: { type: 'ai_video', campaignId: campaign.id, userId: session.user.id },
    client_reference_id: session.user.id,
    success_url: `${base}/campaigns/${campaign.id}?ai_video=success`,
    cancel_url: `${base}/campaigns/${campaign.id}?ai_video=cancel`,
    ...(user?.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : user?.email
      ? { customer_email: user.email }
      : {}),
  });

  return NextResponse.json({ url: checkout.url });
}
