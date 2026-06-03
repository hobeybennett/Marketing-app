import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── hoisted mocks ────────────────────────────────────────────────────────────

const mockFetch = vi.hoisted(() => vi.fn());

const mockPrisma = vi.hoisted(() => ({
  campaign: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  adInsight: {
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../workers/prisma', () => ({ prisma: mockPrisma }));
vi.stubGlobal('fetch', mockFetch);

// ── import ────────────────────────────────────────────────────────────────────

import { runInsightsSync } from '../workers/stages/insights-sync';

// ── helpers ──────────────────────────────────────────────────────────────────

function mockLiveCampaign(withToken = true) {
  return {
    id: 'camp-1',
    metaCampaignId: 'meta_camp_1',
    user: withToken
      ? { metaConnection: { accessToken: 'fake-token' } }
      : null,
  };
}

function makeInsightRow(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        date_start: '2024-01-01',
        date_stop: '2024-01-01',
        spend: '5.00',
        impressions: '1000',
        cpm: '5.00',
        ctr: '2.00',
        cpc: '0.25',
        outbound_clicks: [{ action_type: 'outbound_click', value: '20' }],
        video_p25_watched_actions: [{ action_type: 'video_view', value: '50' }],
        ...overrides,
      },
    ],
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('runInsightsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.adInsight.findFirst.mockResolvedValue(null);
  });

  it('skips campaigns without metaCampaignId', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue({
      id: 'camp-1',
      metaCampaignId: null,
      user: null,
    });

    await runInsightsSync('camp-1');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPrisma.adInsight.create).not.toHaveBeenCalled();
  });

  it('skips when no Meta token available', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockLiveCampaign(false));

    await runInsightsSync('camp-1');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPrisma.adInsight.create).not.toHaveBeenCalled();
  });

  it('fetches insights and creates new records', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockLiveCampaign(true));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeInsightRow(),
    });

    await runInsightsSync('camp-1');

    // 3 fetch calls (campaign, adset, ad level)
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockPrisma.adInsight.create).toHaveBeenCalled();
  });

  it('updates existing records when found', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockLiveCampaign(true));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeInsightRow(),
    });
    mockPrisma.adInsight.findFirst.mockResolvedValue({ id: 'existing-id' });

    await runInsightsSync('camp-1');

    expect(mockPrisma.adInsight.update).toHaveBeenCalled();
    expect(mockPrisma.adInsight.create).not.toHaveBeenCalled();
  });

  it('updates campaign.lastSyncAt after sync', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockLiveCampaign(true));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await runInsightsSync('camp-1');

    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'camp-1' },
        data: expect.objectContaining({ lastSyncAt: expect.any(Date) }),
      }),
    );
  });

  it('throws when Meta API returns an error', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockLiveCampaign(true));
    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => 'Unauthorized',
    });

    await expect(runInsightsSync('camp-1')).rejects.toThrow('Meta Insights API error');
  });
});
