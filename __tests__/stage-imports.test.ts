/**
 * Verifies every worker stage module imports cleanly without throwing.
 * Catches module-level throws (the kind that crashed the worker silently
 * when ANTHROPIC_API_KEY was missing at import time).
 */
import { describe, it } from 'vitest';

describe('stage imports', () => {
  it('imports segmentation stage', async () => {
    await import('../workers/stages/segmentation');
  });
  it('imports video-gen stage', async () => {
    await import('../workers/stages/video-gen');
  });
  it('imports copy-gen stage', async () => {
    await import('../workers/stages/copy-gen');
  });
  it('imports audience-gen stage', async () => {
    await import('../workers/stages/audience-gen');
  });
  it('imports meta-setup stage', async () => {
    await import('../workers/stages/meta-setup');
  });
  it('imports insights-sync stage', async () => {
    await import('../workers/stages/insights-sync');
  });
  it('imports optimise stage', async () => {
    await import('../workers/stages/optimise');
  });
  it('imports lib/queue', async () => {
    await import('../lib/queue');
  });
});
