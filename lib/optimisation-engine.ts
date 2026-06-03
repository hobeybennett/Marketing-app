export interface AdSetMetrics {
  metaAdSetId: string;
  name: string;
  totalSpend: number;
  totalImpressions: number;
  avgCtr: number;
  avgCpc: number;
  totalOutboundClicks: number;
}

export type Verdict = 'WINNER' | 'LOSER' | 'INCONCLUSIVE';

export interface AdSetVerdict {
  metaAdSetId: string;
  name: string;
  verdict: Verdict;
  score: number;
  reason: string;
}

const MIN_SPEND = 3;       // USD
const MIN_IMPRESSIONS = 500;

function computeScore(as: AdSetMetrics): number {
  const ctrComponent = as.avgCtr * 40;
  const clickRateComponent =
    (as.totalOutboundClicks / Math.max(as.totalImpressions, 1)) * 100 * 30;
  const cpcComponent = (1 / Math.max(as.avgCpc, 0.01)) * 30;
  return ctrComponent + clickRateComponent + cpcComponent;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function scoreAdSets(adSets: AdSetMetrics[]): AdSetVerdict[] {
  const eligible = adSets.filter(
    as => as.totalSpend >= MIN_SPEND && as.totalImpressions >= MIN_IMPRESSIONS,
  );

  const scores = new Map<string, number>();
  for (const as of eligible) {
    scores.set(as.metaAdSetId, computeScore(as));
  }

  const eligibleScores = Array.from(scores.values());
  const med = median(eligibleScores);

  return adSets.map(as => {
    const isEligible = as.totalSpend >= MIN_SPEND && as.totalImpressions >= MIN_IMPRESSIONS;
    if (!isEligible) {
      return {
        metaAdSetId: as.metaAdSetId,
        name: as.name,
        verdict: 'INCONCLUSIVE' as Verdict,
        score: 0,
        reason: `Insufficient data (spend: $${as.totalSpend.toFixed(2)}, impressions: ${as.totalImpressions})`,
      };
    }

    const score = scores.get(as.metaAdSetId) ?? 0;
    let verdict: Verdict;
    let reason: string;

    if (score > med * 1.5) {
      verdict = 'WINNER';
      reason = `Score ${score.toFixed(1)} is >50% above median (${med.toFixed(1)}) — high CTR and click rate`;
    } else if (score < med * 0.5 && as.totalSpend >= 5) {
      verdict = 'LOSER';
      reason = `Score ${score.toFixed(1)} is >50% below median (${med.toFixed(1)}) after $${as.totalSpend.toFixed(2)} spend`;
    } else {
      verdict = 'INCONCLUSIVE';
      reason = `Score ${score.toFixed(1)} within normal range of median (${med.toFixed(1)})`;
    }

    return {
      metaAdSetId: as.metaAdSetId,
      name: as.name,
      verdict,
      score,
      reason,
    };
  });
}
