import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  // NextAuth sets this cookie on HTTP, __Secure- prefix on HTTPS
  const token =
    req.cookies.get('next-auth.session-token') ??
    req.cookies.get('__Secure-next-auth.session-token');

  if (!token) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/campaigns/:path*', '/settings/:path*', '/onboarding'],
};
