#!/usr/bin/env tsx
export {};
/**
 * Production smoke tests for Hitwave.
 * Run: BASE_URL=https://your-app.up.railway.app npx tsx scripts/test-production.ts
 * Or:  npx tsx scripts/test-production.ts  (uses NEXT_PUBLIC_BASE_URL env var)
 */

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

type Result = { name: string; pass: boolean; status?: number; note: string };
const results: Result[] = [];

async function test(name: string, fn: () => Promise<{ status: number; body: unknown }>, check: (r: { status: number; body: unknown }) => string | null) {
  try {
    const r = await fn();
    const fail = check(r);
    results.push({ name, pass: !fail, status: r.status, note: fail ?? `${r.status} OK` });
  } catch (e) {
    results.push({ name, pass: false, note: `Error: ${(e as Error).message}` });
  }
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function post(path: string, body: unknown, json = true) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: json ? { 'Content-Type': 'application/json' } : {},
    body: json ? JSON.stringify(body) : body as BodyInit,
  });
  const responseBody = await res.json().catch(() => null);
  return { status: res.status, body: responseBody };
}

async function patch(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const responseBody = await res.json().catch(() => null);
  return { status: res.status, body: responseBody };
}

// ── Tests ──────────────────────────────────────────────────────────────────

await test('Health check', () => get('/api/health'),
  r => r.status === 200 && (r.body as any)?.status === 'ok' ? null : `Expected 200 {status:'ok'}, got ${r.status} ${JSON.stringify(r.body)}`
);

await test('Campaigns list', () => get('/api/campaigns'),
  r => r.status === 200 && Array.isArray(r.body) ? null : `Expected 200 array, got ${r.status}`
);

await test('Spotify lookup — valid track', () =>
  post('/api/spotify/lookup', { url: 'https://open.spotify.com/track/6Jv7kjGkhY2fT4yuBF3aTz' }),
  r => {
    if (r.status !== 200) return `Expected 200, got ${r.status} ${JSON.stringify(r.body)}`;
    const b = r.body as any;
    if (!b?.artistName || !b?.songTitle) return `Missing artistName/songTitle in ${JSON.stringify(b)}`;
    return null;
  }
);

await test('Spotify lookup — invalid track ID', () =>
  post('/api/spotify/lookup', { url: 'https://open.spotify.com/track/BADINVALIDID000' }),
  r => r.status >= 400 ? null : `Expected 4xx, got ${r.status}`
);

await test('Spotify lookup — missing URL', () =>
  post('/api/spotify/lookup', {}),
  r => r.status >= 400 ? null : `Expected 4xx, got ${r.status}`
);

await test('Campaign GET — not found', () => get('/api/campaigns/nonexistent-id-00000'),
  r => r.status === 404 ? null : `Expected 404, got ${r.status}`
);

await test('Campaign PATCH — unknown action', () =>
  patch('/api/campaigns/nonexistent-id-00000', { action: 'bogus' }),
  r => r.status >= 400 ? null : `Expected 4xx, got ${r.status}`
);

await test('Campaign POST — missing audio', async () => {
  const fd = new FormData();
  fd.set('artistName', 'Test Artist');
  fd.set('songTitle', 'Test Song');
  return post('/api/campaigns', fd, false);
}, r => r.status >= 400 ? null : `Expected 4xx for missing audio, got ${r.status}`
);

// UI pages
for (const path of ['/', '/campaigns', '/campaigns/new']) {
  await test(`UI page ${path}`, async () => {
    const res = await fetch(`${BASE_URL}${path}`);
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 200) };
  }, r => {
    if (r.status !== 200) return `Expected 200, got ${r.status}`;
    const html = r.body as string;
    if (!html.includes('<') ) return 'Response does not look like HTML';
    return null;
  });
}

// ── Report ─────────────────────────────────────────────────────────────────

const pad = (s: string, n: number) => s.length >= n ? s : s + ' '.repeat(n - s.length);
const pass = results.filter(r => r.pass).length;
const fail = results.filter(r => !r.pass).length;

console.log(`\nProduction smoke tests — ${BASE_URL}\n`);
console.log(pad('TEST', 42) + pad('STATUS', 10) + 'NOTES');
console.log('─'.repeat(90));
for (const r of results) {
  const icon = r.pass ? '✓' : '✗';
  console.log(`${icon} ${pad(r.name, 40)} ${pad(r.pass ? 'PASS' : 'FAIL', 10)} ${r.note}`);
}
console.log('─'.repeat(90));
console.log(`\n${pass} passed, ${fail} failed\n`);

if (fail > 0) process.exit(1);
