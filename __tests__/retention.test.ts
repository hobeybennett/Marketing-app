import { describe, it, expect, afterEach } from 'vitest';
import { isPrunable, retentionDays } from '../workers/stages/retention';

const saved = process.env.VIDEO_RETENTION_DAYS;
afterEach(() => {
  if (saved === undefined) delete process.env.VIDEO_RETENTION_DAYS;
  else process.env.VIDEO_RETENTION_DAYS = saved;
});

const now = new Date('2026-08-20T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('isPrunable', () => {
  it('prunes launched campaigns past the retention window', () => {
    expect(isPrunable('LIVE', daysAgo(8), now, 7)).toBe(true);
    expect(isPrunable('PAUSED', daysAgo(30), now, 7)).toBe(true);
    expect(isPrunable('FAILED', daysAgo(9), now, 7)).toBe(true);
  });

  it('keeps campaigns inside the window', () => {
    expect(isPrunable('LIVE', daysAgo(1), now, 7)).toBe(false);
    expect(isPrunable('LIVE', daysAgo(6.9), now, 7)).toBe(false);
  });

  it('prunes exactly at the boundary', () => {
    expect(isPrunable('LIVE', daysAgo(7), now, 7)).toBe(true);
  });

  // READY means the artist hasn't launched yet and may still be reviewing the
  // videos — deleting them would empty the review screen.
  it('never prunes campaigns that have not launched', () => {
    for (const status of ['READY', 'PENDING', 'PROCESSING', 'BUILDING', 'CONTENT_READY', 'LAUNCHING']) {
      expect(isPrunable(status, daysAgo(365), now, 7)).toBe(false);
    }
  });

  it('honours VIDEO_RETENTION_DAYS', () => {
    process.env.VIDEO_RETENTION_DAYS = '30';
    expect(retentionDays()).toBe(30);
    expect(isPrunable('LIVE', daysAgo(10), now)).toBe(false);
    expect(isPrunable('LIVE', daysAgo(31), now)).toBe(true);
  });

  it('falls back to 7 days on a missing or nonsense value', () => {
    delete process.env.VIDEO_RETENTION_DAYS;
    expect(retentionDays()).toBe(7);
    process.env.VIDEO_RETENTION_DAYS = 'abc';
    expect(retentionDays()).toBe(7);
    process.env.VIDEO_RETENTION_DAYS = '0';
    expect(retentionDays()).toBe(7);
    process.env.VIDEO_RETENTION_DAYS = '-5';
    expect(retentionDays()).toBe(7);
  });
});
