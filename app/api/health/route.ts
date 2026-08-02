import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Also reports which commit is actually running, so "is my change deployed yet?"
// is answerable in one request — Railway injects these at build time.
export async function GET() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commit: sha ? sha.slice(0, 7) : 'unknown',
    branch: process.env.RAILWAY_GIT_BRANCH ?? 'unknown',
  });
}
