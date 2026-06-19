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

    // Fetch all ad accounts with status (no business field — requires business_management permission)
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/v22.0/me/adaccounts?fields=name,account_id,account_status&limit=25&access_token=${longToken}`
    );
    const adAccountsData = await adAccountsRes.json();
    if (adAccountsData.error) throw new Error(`Ad account lookup failed: ${adAccountsData.error.message} (code ${adAccountsData.error.code})`);
    const allAccounts: any[] = adAccountsData.data ?? [];
    if (!allAccounts.length) throw new Error('No Meta ad accounts found. Create an ad account at business.facebook.com first.');

    console.log('[meta/callback] All ad accounts:', JSON.stringify(allAccounts.map((a: any) => ({
      id: a.account_id, name: a.name, status: a.account_status,
    }))));

    // Filter to active accounts only (status 1), exclude closed (101) / disabled (2)
    const activeAccounts = allAccounts.filter((a: any) => a.account_status === 1);
    if (!activeAccounts.length) throw new Error('No active Meta ad accounts found. All accounts may be closed or disabled.');

    const defaultAccount = activeAccounts[0];
    console.log(`[meta/callback] Default account: ${defaultAccount.account_id} (${defaultAccount.name})`);

    // Store the full list so the user can pick from Settings
    const availableAdAccounts = activeAccounts.map((a: any) => ({
      id: a.account_id,
      name: a.name,
      businessId: null,
      businessName: null,
    }));

    // Fetch all pages — include access_token for Page Access Token
    const pagesRes = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=name,id,access_token&limit=25&access_token=${longToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(`Page lookup failed: ${pagesData.error.message} (code ${pagesData.error.code})`);
    const allPages: any[] = pagesData.data ?? [];
    if (!allPages.length) throw new Error('No Facebook Pages found. Create a Facebook Page at facebook.com/pages/create first.');

    const defaultPage = allPages[0];
    const pageAccessToken: string | null = defaultPage.access_token ?? null;

    // Store pages with their access tokens so the user can switch pages later
    const availablePages = allPages.map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token ?? null,
    }));

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
        adAccountId: defaultAccount.account_id,
        adAccountName: defaultAccount.name,
        availableAdAccounts,
        pageId: defaultPage.id,
        pageName: defaultPage.name,
        availablePages,
        pixelId,
        pixelName,
      },
      update: {
        accessToken: longToken,
        pageAccessToken,
        tokenExpiresAt: expiresAt,
        metaUserId: me.id,
        adAccountId: defaultAccount.account_id,
        adAccountName: defaultAccount.name,
        availableAdAccounts,
        pageId: defaultPage.id,
        pageName: defaultPage.name,
        availablePages,
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
