/**
 * Boot smoke test — spawns the actual worker process and verifies it starts
 * cleanly. Catches the kind of bugs that don't show up in unit tests:
 *  - module-level throws (missing env vars at import time)
 *  - missing prod deps (tsx, prisma, etc.)
 *  - shared Redis connection starvation
 *  - unhandled startup errors
 *
 * Requires a reachable REDIS_URL — set it in CI (see .github/workflows/ci.yml).
 */
import { spawn } from 'child_process';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('worker boot', () => {
  it('starts and prints "listening for jobs" within 10s', async () => {
    if (!process.env.REDIS_URL) {
      // Skip in environments without Redis; CI always provides REDIS_URL
      console.log('[worker-boot] skipping: REDIS_URL not set');
      return;
    }

    // Point the boot worker at an ISOLATED Redis DB (index 9). Vitest runs test
    // files in parallel, and this worker listens on the same 'campaign' queue as
    // the pipeline e2e — on a shared DB it steals the e2e's first job and dies
    // holding the lock (lockDuration 30min), stranding that campaign at
    // PROCESSING until the e2e times out. Boot only needs Redis reachable, not
    // any particular DB, so an empty DB is fine.
    const isolatedRedis = new URL(process.env.REDIS_URL);
    isolatedRedis.pathname = '/9';

    const workerPath = path.resolve(__dirname, '../workers/index.ts');
    const proc = spawn('npx', ['tsx', workerPath], {
      env: { ...process.env, NODE_ENV: 'test', REDIS_URL: isolatedRedis.toString() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let combined = '';
    proc.stdout.on('data', (d) => { combined += d.toString(); });
    proc.stderr.on('data', (d) => { combined += d.toString(); });

    const ready = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 10_000);
      const check = setInterval(() => {
        if (combined.includes('listening for jobs')) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve(true);
        }
        if (proc.exitCode !== null) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve(false);
        }
      }, 200);
    });

    proc.kill('SIGTERM');
    await new Promise((r) => proc.once('exit', r));

    expect(ready, `Worker failed to boot within 10s. Output:\n${combined}`).toBe(true);
  }, 15_000);
});
