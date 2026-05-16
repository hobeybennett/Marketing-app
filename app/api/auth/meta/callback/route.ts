import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const userId = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !userId) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?meta_error=${error ?? 'missing_code'}`
    );
  }

  try {
    // Exchange code for short-lived token
    const tokenRes = await fetch('https://graph.facebook.com/v22.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/meta/callback`,
        code,
      }),
    });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const { access_token: shortToken } = await tokenRes.json();

    // Exchange for long-lived token (60-day)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${process.env.META_APP_ID}` +
      `&client_secret=${process.env.META_APP_SECRET}` +
      `&fb_exchange_token=${shortToken}`
    );
    if (!longTokenRes.ok) throw new Error(await longTokenRes.text());
    const { access_token: longToken, expires_in } = await longTokenRes.json();

    // Get Meta user ID
    const meRes = await fetch(`https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${longToken}`);
    const me = await meRes.json();

    // Get first ad account
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/v22.0/me/adaccounts?fields=name,account_id&access_token=${longToken}`
    );
    const adAccountsData = await adAccountsRes.json();
    const adAccount = adAccountsData.data?.[0];
    if (!adAccount) throw new Error('No Meta ad accounts found. Make sure your Meta account has access to an Ad Account.');

    // Get first page
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=name,id&access_token=${longToken}`
    );
    const pagesData = await pagesRes.json();
    const page = pagesData.data?.[0];
    if (!page) throw new Error('No Facebook Pages found. You need a Facebook Page to run ads.');

    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    await prisma.metaConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: longToken,
        tokenExpiresAt: expiresAt,
        metaUserId: me.id,
        adAccountId: adAccount.account_id,
        adAccountName: adAccount.name,
        pageId: page.id,
        pageName: page.name,
      },
      update: {
        accessToken: longToken,
        tokenExpiresAt: expiresAt,
        metaUserId: me.id,
        adAccountId: adAccount.account_id,
        adAccountName: adAccount.name,
        pageId: page.id,
        pageName: page.name,
      },
    });

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?meta_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[meta/callback]', msg);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?meta_error=${encodeURIComponent(msg)}`
    );
  }
}
