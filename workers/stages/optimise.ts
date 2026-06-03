import { prisma } from '../prisma';
import { scoreAdSets } from '../../lib/optimisation-engine';
import type { AdSetMetrics } from '../../lib/optimisation-engine';

export async function runOptimisation(campaignId: string): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
  });

  const insights = await prisma.adInsight.findMany({
    where: {
      campaignId,
      date: { gte: sevenDaysAgo },
      metaAdSetId: { not: null },
    },
  });

  if (insights.length === 0) {
    console.log(`[optimise] No insight data for campaign ${campaignId} — skipping`);
    return;
  }

  // Aggregate by metaAdSetId
  const adSetMap = new Map<string, AdSetMetrics>();
  for (const insight of insights) {
    const key = insight.metaAdSetId!;
    const existing = adSetMap.get(key) ?? {
      metaAdSetId: key,
      name: key,
      totalSpend: 0,
      totalImpressions: 0,
      avgCtr: 0,
      avgCpc: 0,
      totalOutboundClicks: 0,
      _ctrSum: 0,
      _cpcSum: 0,
      _count: 0,
    } as AdSetMetrics & { _ctrSum: number; _cpcSum: number; _count: number };

    (existing as any)._ctrSum += insight.ctr;
    (existing as any)._cpcSum += insight.cpc;
    (existing as any)._count += 1;
    existing.totalSpend += insight.spend;
    existing.totalImpressions += insight.impressions;
    existing.totalOutboundClicks += insight.outboundClicks;
    adSetMap.set(key, existing);
  }

  // Finalise averages
  const adSets: AdSetMetrics[] = Array.from(adSetMap.values()).map(as => {
    const count = (as as any)._count || 1;
    return {
      metaAdSetId: as.metaAdSetId,
      name: as.name,
      totalSpend: as.totalSpend,
      totalImpressions: as.totalImpressions,
      avgCtr: (as as any)._ctrSum / count,
      avgCpc: (as as any)._cpcSum / count,
      totalOutboundClicks: as.totalOutboundClicks,
    };
  });

  const verdicts = scoreAdSets(adSets);

  // Write OptimisationLog entries for each verdict
  for (const verdict of verdicts) {
    if (verdict.verdict === 'INCONCLUSIVE') continue;

    await prisma.optimisationLog.create({
      data: {
        campaignId,
        metaAdSetId: verdict.metaAdSetId,
        action: verdict.verdict === 'WINNER' ? 'FLAG_WINNER' : 'FLAG_LOSER',
        reason: verdict.reason,
      },
    });
  }

  console.log(`[optimise] Scored ${verdicts.length} ad sets for campaign ${campaignId}`);

  // Apply actions: pause losers, scale winners
  await applyOptimisationActions(campaignId, verdicts);
}

async function applyOptimisationActions(
  campaignId: string,
  verdicts: ReturnType<typeof scoreAdSets>,
) {
  // Get Meta token
  const camp = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { user: { include: { metaConnection: true } } },
  });
  const token =
    camp?.user?.metaConnection?.accessToken ?? process.env.META_ACCESS_TOKEN;

  const META_API = 'https://graph.facebook.com/v22.0';

  for (const verdict of verdicts) {
    if (verdict.verdict === 'LOSER') {
      if (token) {
        try {
          const res = await fetch(
            `${META_API}/${verdict.metaAdSetId}?access_token=${token}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'PAUSED' }),
            },
          );
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error(`[optimise] Failed to pause adset ${verdict.metaAdSetId}:`, err);
        }
      }
      await prisma.optimisationLog.create({
        data: {
          campaignId,
          metaAdSetId: verdict.metaAdSetId,
          action: 'PAUSE_ADSET',
          reason: `CTR below threshold after $${verdict.score.toFixed(2)} spend${!token ? ' (mock mode)' : ''}`,
        },
      });
    } else if (verdict.verdict === 'WINNER') {
      if (token) {
        try {
          // Get current budget
          const budgetRes = await fetch(
            `${META_API}/${verdict.metaAdSetId}?fields=daily_budget&access_token=${token}`,
          );
          if (budgetRes.ok) {
            const budgetData = await budgetRes.json();
            const currentBudget = parseInt(budgetData.daily_budget || '1000', 10);
            const newBudget = Math.round(currentBudget * 1.3);
            const cappedBudget = Math.min(newBudget, currentBudget * 2);

            const updateRes = await fetch(
              `${META_API}/${verdict.metaAdSetId}?access_token=${token}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daily_budget: cappedBudget }),
              },
            );
            if (!updateRes.ok) throw new Error(await updateRes.text());

            await prisma.optimisationLog.create({
              data: {
                campaignId,
                metaAdSetId: verdict.metaAdSetId,
                action: 'SCALE_BUDGET',
                reason: `High CTR ad set — budget increased 30%`,
                previousValue: currentBudget,
                newValue: cappedBudget,
              },
            });
          }
        } catch (err) {
          console.error(`[optimise] Failed to scale adset ${verdict.metaAdSetId}:`, err);
        }
      } else {
        // Mock mode
        await prisma.optimisationLog.create({
          data: {
            campaignId,
            metaAdSetId: verdict.metaAdSetId,
            action: 'SCALE_BUDGET',
            reason: `High CTR ad set — budget increase would be applied (mock mode — no Meta token)`,
          },
        });
      }
    }
  }
}
