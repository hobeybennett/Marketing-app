import { describe, it, expect } from 'vitest';
import {
  buildCampaignBody,
  buildAdSetBody,
  buildAdCreativeBody,
  buildCampaignObjectives,
  SPOTIFY_CLICK_CONVERSION_NAME,
} from '../lib/meta-campaign';
import { evaluateCriteria, type CriterionContext } from '../lib/meta-test-criteria';

// Build the objects the way production does, then feed them through the criteria
// evaluator exactly as if Meta echoed them straight back. This locks the criteria
// table to the builders: if a builder changes shape, the matching criterion must
// be updated in lockstep or this test goes red.

function readbackFromBuilders(ctx: CriterionContext) {
  const [objective] = buildCampaignObjectives(ctx.useConversions);
  const campaign = buildCampaignBody({ name: 'TEST', objective });
  const adset = buildAdSetBody({
    name: 'ad set',
    campaignId: 'c1',
    useConversions: ctx.useConversions,
    pixelId: ctx.pixelId,
    customConversionId: ctx.customConversionId,
    dailyBudgetCents: 100,
    audience: { type: 'INTEREST', interests: [] },
    artistName: 'Artist',
  });
  const creative = buildAdCreativeBody({
    name: 'creative',
    pageId: ctx.pageId,
    instagramUserId: ctx.instagramUserId,
    videoId: 'v1',
    imageHash: 'h1',
    message: 'hi',
    link: 'https://example.com/go/test',
  });
  return { campaign, adset, creative, ad: { status: 'PAUSED' } };
}

describe('meta-test-criteria', () => {
  it('all criteria pass when useConversions with an IG identity', () => {
    const ctx: CriterionContext = {
      useConversions: true,
      pixelId: '111',
      customConversionId: '222',
      pageId: 'PAGE_1',
      instagramUserId: 'IG_1',
      chosenObjective: 'OUTCOME_ENGAGEMENT',
    };
    const { results, overall } = evaluateCriteria(readbackFromBuilders(ctx), ctx);
    const failing = results.filter((r) => !r.pass);
    expect(failing, JSON.stringify(failing, null, 2)).toHaveLength(0);
    expect(overall).toBe(true);
  });

  it('all criteria pass on the no-pixel Traffic path', () => {
    const ctx: CriterionContext = {
      useConversions: false,
      pixelId: null,
      customConversionId: null,
      pageId: 'PAGE_1',
      instagramUserId: null,
      chosenObjective: 'OUTCOME_TRAFFIC',
    };
    const { results, overall } = evaluateCriteria(readbackFromBuilders(ctx), ctx);
    const failing = results.filter((r) => !r.pass);
    expect(failing, JSON.stringify(failing, null, 2)).toHaveLength(0);
    expect(overall).toBe(true);
  });

  it('flags a wrong objective', () => {
    const ctx: CriterionContext = {
      useConversions: true,
      pixelId: '111',
      customConversionId: '222',
      pageId: 'PAGE_1',
      instagramUserId: 'IG_1',
      chosenObjective: 'OUTCOME_ENGAGEMENT',
    };
    const rb = readbackFromBuilders(ctx);
    rb.campaign = { ...rb.campaign, objective: 'OUTCOME_SALES' };
    const { results, overall } = evaluateCriteria(rb, ctx);
    expect(overall).toBe(false);
    expect(results.find((r) => r.name === 'Objective')?.pass).toBe(false);
  });

  it('flags a missing Instagram identity when one is expected', () => {
    const ctx: CriterionContext = {
      useConversions: true,
      pixelId: '111',
      customConversionId: '222',
      pageId: 'PAGE_1',
      instagramUserId: 'IG_1',
      chosenObjective: 'OUTCOME_ENGAGEMENT',
    };
    const rb = readbackFromBuilders({ ...ctx, instagramUserId: null });
    const { results } = evaluateCriteria(rb, ctx);
    expect(results.find((r) => r.name === 'Instagram account')?.pass).toBe(false);
  });

  it('conversion criterion references the Spotify click conversion', () => {
    expect(SPOTIFY_CLICK_CONVERSION_NAME).toBe('Promohit Spotify Click');
  });
});
