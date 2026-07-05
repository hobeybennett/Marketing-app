import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Live Meta rate-limit usage. Makes one cheap call and reads the usage headers
// Meta returns on every Marketing API response. Values are % of limit (0-100);
// call_count is the main one to watch. App usage is shared across all customers.
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const conn = await prisma.metaConnection.findUnique({ where: { userId: session.user.id } });
  const token = conn?.accessToken ?? process.env.META_ACCESS_TOKEN;
  const acct = conn?.adAccountId ?? process.env.META_AD_ACCOUNT_ID;
  if (!token || !acct) {
    return NextResponse.json({ error: 'Connect your Meta account first.' }, { status: 400 });
  }

  const res = await fetch(`https://graph.facebook.com/v22.0/act_${acct}?fields=name&access_token=${token}`);
  const parse = (h: string | null) => {
    if (!h) return null;
    try { return JSON.parse(h); } catch { return h; }
  };

  return NextResponse.json({
    appUsage: parse(res.headers.get('x-app-usage')),                       // app-level (shared across all customers)
    businessUseCaseUsage: parse(res.headers.get('x-business-use-case-usage')), // per business/ad account, per use-case
    adAccountUsage: parse(res.headers.get('x-ad-account-usage')),          // this ad account
    note: 'Percentages are 0–100 (% of the limit). call_count is the main one to watch; anything under ~80 is healthy.',
  });
}
