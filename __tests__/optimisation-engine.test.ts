import { describe, it, expect } from 'vitest';
import { scoreAdSets } from '../lib/optimisation-engine';
import type { AdSetMetrics } from '../lib/optimisation-engine';

function makeAdSet(overrides: Partial<AdSetMetrics> = {}): AdSetMetrics {
  return {
    metaAdSetId: 'adset-1',
    name: 'Test Ad Set',
    totalSpend: 10,
    totalImpressions: 1000,
    avgCtr: 2.5,
    avgCpc: 0.5,
    totalOutboundClicks: 25,
    ...overrides,
  };
}

describe('scoreAdSets', () => {
  it('returns INCONCLUSIVE for ad sets below minimum spend', () => {
    const adSets = [
      makeAdSet({ metaAdSetId: 'as-1', totalSpend: 1, totalImpressions: 1000 }),
    ];
    const [verdict] = scoreAdSets(adSets);
    expect(verdict.verdict).toBe('INCONCLUSIVE');
  });

  it('returns INCONCLUSIVE for ad sets below minimum impressions', () => {
    const adSets = [
      makeAdSet({ metaAdSetId: 'as-1', totalSpend: 10, totalImpressions: 100 }),
    ];
    const [verdict] = scoreAdSets(adSets);
    expect(verdict.verdict).toBe('INCONCLUSIVE');
  });

  it('returns all INCONCLUSIVE when only one ad set (no median comparison)', () => {
    const adSets = [
      makeAdSet({ metaAdSetId: 'as-1', totalSpend: 10, totalImpressions: 1000 }),
    ];
    const results = scoreAdSets(adSets);
    // Single eligible set — score equals median, so INCONCLUSIVE
    expect(results[0].verdict).toBe('INCONCLUSIVE');
  });

  it('identifies WINNER when score is >150% of median', () => {
    const adSets = [
      makeAdSet({ metaAdSetId: 'as-winner', name: 'Winner', avgCtr: 15, totalOutboundClicks: 150, avgCpc: 0.1, totalSpend: 10, totalImpressions: 1000 }),
      makeAdSet({ metaAdSetId: 'as-avg', name: 'Average', avgCtr: 2, totalOutboundClicks: 20, avgCpc: 0.5, totalSpend: 10, totalImpressions: 1000 }),
      makeAdSet({ metaAdSetId: 'as-low', name: 'Low', avgCtr: 1, totalOutboundClicks: 10, avgCpc: 1.0, totalSpend: 10, totalImpressions: 1000 }),
    ];
    const results = scoreAdSets(adSets);
    const winner = results.find(r => r.metaAdSetId === 'as-winner');
    expect(winner?.verdict).toBe('WINNER');
  });

  it('identifies LOSER when score is <50% of median and spend >= $5', () => {
    const adSets = [
      makeAdSet({ metaAdSetId: 'as-winner', name: 'Winner', avgCtr: 15, totalOutboundClicks: 150, avgCpc: 0.1, totalSpend: 10, totalImpressions: 1000 }),
      makeAdSet({ metaAdSetId: 'as-avg', name: 'Average', avgCtr: 2, totalOutboundClicks: 20, avgCpc: 0.5, totalSpend: 10, totalImpressions: 1000 }),
      makeAdSet({ metaAdSetId: 'as-loser', name: 'Loser', avgCtr: 0.01, totalOutboundClicks: 0, avgCpc: 5.0, totalSpend: 8, totalImpressions: 1000 }),
    ];
    const results = scoreAdSets(adSets);
    const loser = results.find(r => r.metaAdSetId === 'as-loser');
    expect(loser?.verdict).toBe('LOSER');
  });

  it('does not mark LOSER if spend < $5', () => {
    const adSets = [
      makeAdSet({ metaAdSetId: 'as-1', name: 'High', avgCtr: 15, totalOutboundClicks: 150, avgCpc: 0.1, totalSpend: 10, totalImpressions: 1000 }),
      makeAdSet({ metaAdSetId: 'as-low', name: 'Low spend loser', avgCtr: 0.01, totalOutboundClicks: 0, avgCpc: 5.0, totalSpend: 4, totalImpressions: 1000 }),
    ];
    const results = scoreAdSets(adSets);
    const lowSpend = results.find(r => r.metaAdSetId === 'as-low');
    expect(lowSpend?.verdict).not.toBe('LOSER');
  });

  it('includes score and reason in each verdict', () => {
    const adSets = [
      makeAdSet({ metaAdSetId: 'as-1', totalSpend: 10, totalImpressions: 1000 }),
    ];
    const [verdict] = scoreAdSets(adSets);
    expect(typeof verdict.score).toBe('number');
    expect(typeof verdict.reason).toBe('string');
    expect(verdict.reason.length).toBeGreaterThan(0);
  });

  it('handles empty array', () => {
    const results = scoreAdSets([]);
    expect(results).toHaveLength(0);
  });
});
