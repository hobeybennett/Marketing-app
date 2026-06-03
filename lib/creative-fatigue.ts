export interface FatigueReport {
  hasFatigue: boolean;
  affectedCreatives: string[];  // metaAdId values with declining performance
  reason: string;
}

interface InsightLike {
  date: Date;
  ctr: number;
  spend: number;
  metaAdId?: string | null;
}

export function detectFatigue(
  insights: InsightLike[],
  windowDays = 3,
): FatigueReport {
  if (insights.length === 0) {
    return { hasFatigue: false, affectedCreatives: [], reason: 'No insight data available' };
  }

  const now = new Date();
  const recentCutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const priorCutoff = new Date(now.getTime() - windowDays * 2 * 24 * 60 * 60 * 1000);

  const recentInsights = insights.filter(i => new Date(i.date) >= recentCutoff);
  const priorInsights = insights.filter(
    i => new Date(i.date) >= priorCutoff && new Date(i.date) < recentCutoff,
  );

  if (recentInsights.length === 0 || priorInsights.length === 0) {
    return {
      hasFatigue: false,
      affectedCreatives: [],
      reason: 'Insufficient data for fatigue comparison',
    };
  }

  const recentSpend = recentInsights.reduce((s, i) => s + i.spend, 0);
  if (recentSpend < 3) {
    return {
      hasFatigue: false,
      affectedCreatives: [],
      reason: `Insufficient recent spend ($${recentSpend.toFixed(2)}) for fatigue detection`,
    };
  }

  const recentAvgCtr = recentInsights.reduce((s, i) => s + i.ctr, 0) / recentInsights.length;
  const priorAvgCtr = priorInsights.reduce((s, i) => s + i.ctr, 0) / priorInsights.length;

  if (priorAvgCtr === 0) {
    return { hasFatigue: false, affectedCreatives: [], reason: 'No prior CTR data to compare' };
  }

  const ctrDrop = (priorAvgCtr - recentAvgCtr) / priorAvgCtr;

  if (ctrDrop > 0.4) {
    // Collect affected creative metaAdIds from the recent period
    const affectedCreatives = [
      ...new Set(
        recentInsights
          .filter(i => i.metaAdId)
          .map(i => i.metaAdId!),
      ),
    ];

    return {
      hasFatigue: true,
      affectedCreatives,
      reason: `CTR dropped ${(ctrDrop * 100).toFixed(1)}% (from ${priorAvgCtr.toFixed(2)}% to ${recentAvgCtr.toFixed(2)}%) over last ${windowDays} days`,
    };
  }

  return {
    hasFatigue: false,
    affectedCreatives: [],
    reason: `CTR change of ${(ctrDrop * 100).toFixed(1)}% is within acceptable range`,
  };
}
