import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/meta/callback`,
    scope: 'ads_management,ads_read,pages_show_list,pages_manage_ads,pages_read_engagement',
    response_type: 'code',
    state: session.user.id, // pass userId so callback knows who connected
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v22.0/dialog/oauth?${params}`
  );
}
