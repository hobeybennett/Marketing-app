import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Hypewave Campaign Credit',
          description: 'Launch one Meta ad campaign for your music',
        },
        unit_amount: 499,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${appUrl}/campaigns?payment=success`,
    cancel_url: `${appUrl}/campaigns?payment=cancelled`,
    metadata: { userId: session.user.id },
  });

  return NextResponse.redirect(checkoutSession.url!);
}
