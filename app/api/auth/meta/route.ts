import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now();

  // Build a tamper-evident state: base64url-encoded payload + HMAC signature
  const payload = Buffer.from(JSON.stringify({ userId, nonce, ts })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(`${userId}:${nonce}:${ts}`)
    .digest('hex');
  const state = `${payload}.${sig}`;

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/meta/callback`,
    // instagram_basic lets us read the Instagram account linked to each Page so
    // ads can run under the artist's IG identity. We deliberately do NOT request
    // instagram_manage_ads — it's an advanced permission that requires the
    // Instagram product to be fully configured/approved on the Meta app, and
    // requesting it before that breaks the whole OAuth dialog. instagram_basic
    // alone is sufficient to publish ads under a Page-linked IG account.
    scope: 'ads_management,ads_read,pages_show_list,pages_manage_ads,pages_read_engagement,instagram_basic',
    response_type: 'code',
    state,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v22.0/dialog/oauth?${params}`
  );
}
