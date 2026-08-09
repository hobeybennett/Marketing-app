import { describe, it, expect, afterEach } from 'vitest';
import { buildRenderPlan, vibeCountFor, isMatrixMode } from '../lib/video-plan';
import { VIBES } from '../lib/stock-video';

const ENV = ['VIDEO_VIBE_COUNT', 'VIDEO_MATRIX'] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
});

describe('buildRenderPlan', () => {
  it('defaults to one creative per audio section (unchanged behaviour)', () => {
    delete process.env.VIDEO_VIBE_COUNT;
    delete process.env.VIDEO_MATRIX;
    const plan = buildRenderPlan(5);
    expect(plan).toHaveLength(5);
    // Each creative gets its own vibe and its own section.
    expect(plan.map((p) => p.vibeIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(plan.map((p) => p.segmentIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('builds the full matrix: 10 vibes × 5 sections = 50 variants', () => {
    process.env.VIDEO_VIBE_COUNT = '10';
    process.env.VIDEO_MATRIX = 'true';
    const plan = buildRenderPlan(5);
    expect(plan).toHaveLength(50);
    // Every vibe/section pair appears exactly once.
    const pairs = new Set(plan.map((p) => `${p.vibeIndex}:${p.segmentIndex}`));
    expect(pairs.size).toBe(50);
    expect(Math.max(...plan.map((p) => p.vibeIndex))).toBe(9);
    expect(Math.max(...plan.map((p) => p.segmentIndex))).toBe(4);
  });

  it('caps vibes at the size of the library', () => {
    process.env.VIDEO_VIBE_COUNT = '99';
    expect(vibeCountFor(5)).toBe(VIBES.length);
    process.env.VIDEO_MATRIX = 'true';
    expect(buildRenderPlan(5)).toHaveLength(VIBES.length * 5);
  });

  it('rotates sections when there are more vibes than sections (non-matrix)', () => {
    process.env.VIDEO_VIBE_COUNT = '7';
    delete process.env.VIDEO_MATRIX;
    const plan = buildRenderPlan(3);
    expect(plan).toHaveLength(7);
    expect(plan.map((p) => p.segmentIndex)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it('never divides by zero when a campaign has no segments yet', () => {
    process.env.VIDEO_MATRIX = 'true';
    process.env.VIDEO_VIBE_COUNT = '3';
    const plan = buildRenderPlan(0);
    expect(plan).toHaveLength(3);
    expect(plan.every((p) => p.segmentIndex === 0)).toBe(true);
  });

  it('treats any value other than "true" as matrix off', () => {
    process.env.VIDEO_MATRIX = 'false';
    expect(isMatrixMode()).toBe(false);
    process.env.VIDEO_MATRIX = '1';
    expect(isMatrixMode()).toBe(false);
  });
});
