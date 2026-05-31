import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';

// ── hoisted mock state ────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  campaign: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  audience: {
    update: vi.fn().mockResolvedValue({}),
  },
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../workers/prisma', () => ({ prisma: mockPrisma }));
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('video-data')),
}));

// Stub fetch globally before any test
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── import under test (after mocks are hoisted) ───────────────────────────────

import { runMetaSetup } from '../workers/stages/meta-setup';

// ── helpers ───────────────────────────────────────────────────────────────────

function jsonOk(data: object) {
  return { ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) };
}

function errorRes(text: string) {
  return { ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve(text) };
}

function makeAudience(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aud-1', name: 'Interest Audience', type: 'INTEREST', interests: [], metaAdSetId: null,
    ...overrides,
  };
}

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    artistName: 'Jeff Buckley',
    songTitle: 'Hallelujah',
    metaCampaignId: null,
    creatives: [{
      id: 'c-0',
      fileUrl: '/uploads/camp-1/videos/creative_0.mp4',
      ctaText: 'Listen Now',
      adCopies: [{ headline: 'Feel the Music', primaryText: 'Stream now.', description: 'Out now' }],
    }],
    audiences: [makeAudience()],
    user: { metaConnection: null },
    ...overrides,
  };
}

/** Queue mock fetch responses for the standard single-creative/single-audience flow */
function stubFullFlow() {
  mockFetch
    .mockResolvedValueOnce(jsonOk({ id: 'meta-campaign-id' }))    // POST /campaigns
    .mockResolvedValueOnce(jsonOk({ video_id: 'vid-001' }))        // POST /advideos
    .mockResolvedValueOnce(jsonOk({ id: 'adcreative-001' }))       // POST /adcreatives
    .mockResolvedValueOnce(jsonOk({ id: 'adset-001' }))            // POST /adsets
    .mockResolvedValueOnce(jsonOk({ id: 'ad-001' }));              // POST /ads
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('runMetaSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('video-data') as any);
  });

  // ── mock mode ─────────────────────────────────────────────────────────────

  describe('mock mode (no credentials)', () => {
    it('sets status to LIVE with a mock campaign ID when no token is configured', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());

      await runMetaSetup('camp-1');

      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          status: 'LIVE',
          metaCampaignId: expect.stringContaining('mock_campaign'),
        }),
      });
    });

    it('makes no real Meta API calls in mock mode', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());

      await runMetaSetup('camp-1');

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── credential validation ─────────────────────────────────────────────────

  describe('credential validation', () => {
    it('throws when token is set but adAccountId is missing', async () => {
      vi.stubEnv('META_ACCESS_TOKEN', 'test-token');
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());

      await expect(runMetaSetup('camp-1')).rejects.toThrow(/ad account/i);
    });

    it('throws when token and adAccountId are present but pageId is missing', async () => {
      vi.stubEnv('META_ACCESS_TOKEN', 'test-token');
      vi.stubEnv('META_AD_ACCOUNT_ID', 'act-123');
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());

      await expect(runMetaSetup('camp-1')).rejects.toThrow(/page/i);
    });
  });

  // ── full credentials flow ─────────────────────────────────────────────────

  describe('real-credentials flow', () => {
    beforeEach(() => {
      vi.stubEnv('META_ACCESS_TOKEN', 'env-token');
      vi.stubEnv('META_AD_ACCOUNT_ID', 'act-123');
      vi.stubEnv('META_PAGE_ID', 'page-456');
    });

    it('creates a Meta campaign with OUTCOME_TRAFFIC objective and PAUSED status', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());
      stubFullFlow();

      await runMetaSetup('camp-1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/campaigns');
      const body = JSON.parse(options.body);
      expect(body.objective).toBe('OUTCOME_TRAFFIC');
      expect(body.status).toBe('PAUSED');
    });

    it('saves metaCampaignId to DB after campaign creation', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());
      stubFullFlow();

      await runMetaSetup('camp-1');

      expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ metaCampaignId: 'meta-campaign-id' }) }),
      );
    });

    it('sets campaign status to LIVE at the end', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());
      stubFullFlow();

      await runMetaSetup('camp-1');

      const lastUpdate = mockPrisma.campaign.update.mock.calls.at(-1)!;
      expect(lastUpdate[0].data.status).toBe('LIVE');
    });

    it('skips Meta campaign creation when metaCampaignId already exists (retry idempotency)', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign({ metaCampaignId: 'existing-id' }));
      // No campaign creation call needed
      mockFetch
        .mockResolvedValueOnce(jsonOk({ video_id: 'vid-001' }))
        .mockResolvedValueOnce(jsonOk({ id: 'adcreative-001' }))
        .mockResolvedValueOnce(jsonOk({ id: 'adset-001' }))
        .mockResolvedValueOnce(jsonOk({ id: 'ad-001' }));

      await runMetaSetup('camp-1');

      const campaignCreateCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        typeof url === 'string' && url.includes('/campaigns?'),
      );
      expect(campaignCreateCalls).toHaveLength(0);
    });

    it('skips adSet and ad creation when audience already has a metaAdSetId (retry idempotency)', async () => {
      const audience = makeAudience({ metaAdSetId: 'existing-adset' });
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign({ audiences: [audience] }));
      mockFetch
        .mockResolvedValueOnce(jsonOk({ id: 'meta-campaign-id' }))
        .mockResolvedValueOnce(jsonOk({ video_id: 'vid-001' }))
        .mockResolvedValueOnce(jsonOk({ id: 'adcreative-001' }));

      await runMetaSetup('camp-1');

      const adsetCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        typeof url === 'string' && url.includes('/adsets?'),
      );
      expect(adsetCalls).toHaveLength(0);
    });

    it('saves metaAdSetId to DB after adSet creation', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());
      stubFullFlow();

      await runMetaSetup('camp-1');

      expect(mockPrisma.audience.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { metaAdSetId: 'adset-001' } }),
      );
    });

    it('prefers user MetaConnection token over env vars', async () => {
      const campaign = makeCampaign({
        user: {
          metaConnection: {
            accessToken: 'user-oauth-token',
            adAccountId: 'user-act-789',
            pageId: 'user-page-999',
          },
        },
      });
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(campaign);
      stubFullFlow();

      await runMetaSetup('camp-1');

      for (const [url] of mockFetch.mock.calls) {
        if (typeof url === 'string') {
          expect(url).toContain('user-oauth-token');
          expect(url).not.toContain('env-token');
        }
      }
    });

    it('skips video upload and adCreative when creative file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());
      // Only campaign creation + adset (ad skipped since no adCreativeId)
      mockFetch
        .mockResolvedValueOnce(jsonOk({ id: 'meta-campaign-id' }))
        .mockResolvedValueOnce(jsonOk({ id: 'adset-001' }));

      await runMetaSetup('camp-1');

      const videoCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        typeof url === 'string' && url.includes('/advideos'),
      );
      const adCreativeCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        typeof url === 'string' && url.includes('/adcreatives'),
      );
      expect(videoCalls).toHaveLength(0);
      expect(adCreativeCalls).toHaveLength(0);
    });

    it('throws when the Meta API returns an error response', async () => {
      mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(makeCampaign());
      mockFetch.mockResolvedValueOnce(errorRes('{"error":{"message":"Invalid token"}}'));

      await expect(runMetaSetup('camp-1')).rejects.toThrow(/Meta API error/i);
    });
  });
});
