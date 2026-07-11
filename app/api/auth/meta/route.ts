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

  // Base scopes — the known-good set that Meta grants without extra app config.
  const scopes = ['ads_management', 'ads_read', 'pages_show_list', 'pages_manage_ads', 'pages_read_engagement'];
  // instagram_basic lets us read the Instagram account linked to each Page so ads
  // can run under the artist's IG identity. It's OPT-IN: requesting it before the
  // Instagram product is configured/approved on the Meta app breaks the entire
  // OAuth dialog ("Sorry, something went wrong"). Once instagram_basic is added
  // to the app, set META_ENABLE_INSTAGRAM_SCOPE=true on Railway to turn it on —
  // no code deploy required.
  if (process.env.META_ENABLE_INSTAGRAM_SCOPE === 'true') {
    scopes.push('instagram_basic');
  }

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/meta/callback`,
    scope: scopes.join(','),
    response_type: 'code',
    state,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v22.0/dialog/oauth?${params}`
  );
}
