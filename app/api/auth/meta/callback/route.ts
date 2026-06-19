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
    if (me.error) throw new Error(`Meta user lookup failed: ${me.error.message}`);

    // Get first ad account
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/v22.0/me/adaccounts?fields=name,account_id&limit=10&access_token=${longToken}`
    );
    const adAccountsData = await adAccountsRes.json();
    if (adAccountsData.error) throw new Error(`Ad account lookup failed: ${adAccountsData.error.message} (code ${adAccountsData.error.code})`);
    const adAccount = adAccountsData.data?.[0];
    if (!adAccount) throw new Error('No Meta ad accounts found. Create an ad account at business.facebook.com first.');

    // Get first page — include access_token to get the Page Access Token for ad creatives
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=name,id,access_token&limit=10&access_token=${longToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(`Page lookup failed: ${pagesData.error.message} (code ${pagesData.error.code})`);
    const page = pagesData.data?.[0];
    if (!page) throw new Error('No Facebook Pages found. Create a Facebook Page at facebook.com/pages/create first.');
    const pageAccessToken: string | null = page.access_token ?? null;

    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    // Get first pixel (best-effort — not required)
    let pixelId: string | null = null;
    let pixelName: string | null = null;
    try {
      const pixelsRes = await fetch(
        `https://graph.facebook.com/v22.0/me/adspixels?fields=id,name&limit=1&access_token=${longToken}`
      );
      const pixelsData = await pixelsRes.json();
      if (!pixelsData.error && pixelsData.data?.[0]) {
        pixelId = pixelsData.data[0].id;
        pixelName = pixelsData.data[0].name ?? null;
      }
    } catch { /* non-fatal */ }

    await prisma.metaConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: longToken,
        pageAccessToken,
        tokenExpiresAt: expiresAt,
        metaUserId: me.id,
        adAccountId: adAccount.account_id,
        adAccountName: adAccount.name,
        pageId: page.id,
        pageName: page.name,
        pixelId,
        pixelName,
      },
      update: {
        accessToken: longToken,
        pageAccessToken,
        tokenExpiresAt: expiresAt,
        metaUserId: me.id,
        adAccountId: adAccount.account_id,
        adAccountName: adAccount.name,
        pageId: page.id,
        pageName: page.name,
        pixelId,
        pixelName,
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
