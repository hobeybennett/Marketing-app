import { describe, it, expect } from 'vitest';
import { detectFatigue } from '../lib/creative-fatigue';

function makeInsight(daysAgo: number, ctr: number, spend = 5, metaAdId?: string) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return { date, ctr, spend, metaAdId: metaAdId ?? null };
}

describe('detectFatigue', () => {
  it('returns no fatigue for empty insights', () => {
    const result = detectFatigue([]);
    expect(result.hasFatigue).toBe(false);
  });

  it('returns no fatigue when insufficient recent spend', () => {
    const insights = [
      makeInsight(1, 2.0, 0.5),  // recent, low spend
      makeInsight(5, 3.0, 1.0),  // prior
    ];
    const result = detectFatigue(insights);
    expect(result.hasFatigue).toBe(false);
  });

  it('detects fatigue when CTR drops more than 40%', () => {
    // Prior window: CTR of 5%
    // Recent window: CTR of 2% (60% drop > 40%)
    const insights = [
      makeInsight(1, 2.0, 5.0, 'ad-1'),   // recent
      makeInsight(2, 2.0, 5.0, 'ad-1'),   // recent
      makeInsight(3, 2.0, 5.0, 'ad-1'),   // recent
      makeInsight(4, 5.0, 5.0, 'ad-1'),   // prior
      makeInsight(5, 5.0, 5.0, 'ad-1'),   // prior
      makeInsight(6, 5.0, 5.0, 'ad-1'),   // prior
    ];
    const result = detectFatigue(insights, 3);
    expect(result.hasFatigue).toBe(true);
    expect(result.reason).toContain('CTR dropped');
  });

  it('does not detect fatigue when CTR drop is < 40%', () => {
    // CTR drops from 5 to 4 (20% drop)
    const insights = [
      makeInsight(1, 4.0, 5.0),
      makeInsight(2, 4.0, 5.0),
      makeInsight(3, 4.0, 5.0),
      makeInsight(4, 5.0, 5.0),
      makeInsight(5, 5.0, 5.0),
      makeInsight(6, 5.0, 5.0),
    ];
    const result = detectFatigue(insights, 3);
    expect(result.hasFatigue).toBe(false);
  });

  it('includes affected creative metaAdIds when fatigue detected', () => {
    const insights = [
      makeInsight(1, 1.0, 5.0, 'ad-abc'),
      makeInsight(2, 1.0, 5.0, 'ad-abc'),
      makeInsight(3, 1.0, 5.0, 'ad-abc'),
      makeInsight(4, 5.0, 5.0, 'ad-abc'),
      makeInsight(5, 5.0, 5.0, 'ad-abc'),
      makeInsight(6, 5.0, 5.0, 'ad-abc'),
    ];
    const result = detectFatigue(insights, 3);
    expect(result.hasFatigue).toBe(true);
    expect(result.affectedCreatives).toContain('ad-abc');
  });

  it('returns no fatigue when there are no prior period rows', () => {
    const insights = [makeInsight(1, 2.0, 5.0)];
    const result = detectFatigue(insights, 3);
    expect(result.hasFatigue).toBe(false);
  });
});
