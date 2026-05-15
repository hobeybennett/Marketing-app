import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore, buildMockDetail, MockCampaign } from '@/lib/mock-store';

// Helper to create a fresh campaign for each test
function createTestCampaign(): MockCampaign {
  return mockStore.create({
    artistName: 'Test Artist',
    songTitle: 'Test Song',
    coverArtUrl: '/uploads/test-cover.jpg',
    autoLaunch: false,
  });
}

describe('mockStore.create', () => {
  it('returns an object with an id', () => {
    const campaign = createTestCampaign();
    expect(campaign.id).toBeDefined();
    expect(typeof campaign.id).toBe('string');
    expect(campaign.id.length).toBeGreaterThan(0);
  });
});

describe('mockStore.get', () => {
  it('returns the created campaign by id', () => {
    const campaign = createTestCampaign();
    const fetched = mockStore.get(campaign.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(campaign.id);
    expect(fetched?.artistName).toBe('Test Artist');
    expect(fetched?.songTitle).toBe('Test Song');
  });

  it('returns undefined for a nonexistent id', () => {
    const result = mockStore.get('nonexistent-id-12345');
    expect(result).toBeUndefined();
  });
});

describe('buildMockDetail', () => {
  it('returns an object with jobs, creatives, segments, and audiences arrays', () => {
    const campaign = createTestCampaign();
    const detail = buildMockDetail(campaign);
    expect(Array.isArray(detail.jobs)).toBe(true);
    expect(Array.isArray(detail.creatives)).toBe(true);
    expect(Array.isArray(detail.segments)).toBe(true);
    expect(Array.isArray(detail.audiences)).toBe(true);
  });

  it('returns a status field', () => {
    const campaign = createTestCampaign();
    const detail = buildMockDetail(campaign);
    expect(detail.status).toBeDefined();
  });

  it('returns exactly 4 jobs', () => {
    const campaign = createTestCampaign();
    const detail = buildMockDetail(campaign);
    expect(detail.jobs).toHaveLength(4);
  });
});

describe('buildMockDetail with simulated content completion', () => {
  it('returns exactly 5 creatives when content phase is done', () => {
    // Simulate content phase completion by backdating createdAt
    const campaign = createTestCampaign();
    // Mutate createdAt to simulate 17+ seconds ago (SEGMENTATION_MS + VIDEO_GEN_MS = 17000)
    campaign.createdAt = new Date(Date.now() - 18000);
    const detail = buildMockDetail(campaign);
    expect(detail.creatives).toHaveLength(5);
  });

  it('returns exactly 5 segments when content phase is done', () => {
    const campaign = createTestCampaign();
    campaign.createdAt = new Date(Date.now() - 18000);
    const detail = buildMockDetail(campaign);
    expect(detail.segments).toHaveLength(5);
  });
});

describe('buildMockDetail with simulated campaign completion', () => {
  it('returns 3 audiences when campaign phase is done', () => {
    const campaign = createTestCampaign();
    campaign.createdAt = new Date(Date.now() - 18000);
    // campaignStartedAt set 11+ seconds ago (COPY_GEN_MS + AUDIENCE_GEN_MS = 11000)
    campaign.campaignStartedAt = new Date(Date.now() - 12000);
    const detail = buildMockDetail(campaign);
    expect(detail.audiences).toHaveLength(3);
  });
});

describe('mockStore.startCampaignPhase', () => {
  it('sets campaignStartedAt on the campaign', () => {
    const campaign = createTestCampaign();
    expect(campaign.campaignStartedAt).toBeUndefined();
    mockStore.startCampaignPhase(campaign.id);
    const updated = mockStore.get(campaign.id);
    expect(updated?.campaignStartedAt).toBeInstanceOf(Date);
  });
});

describe('mockStore.launch', () => {
  it('sets launchedAt on the campaign', () => {
    const campaign = createTestCampaign();
    expect(campaign.launchedAt).toBeUndefined();
    mockStore.launch(campaign.id);
    const updated = mockStore.get(campaign.id);
    expect(updated?.launchedAt).toBeInstanceOf(Date);
  });
});

describe('newly created campaign status', () => {
  it('has status PROCESSING immediately after creation (content not yet done)', () => {
    const campaign = createTestCampaign();
    const detail = buildMockDetail(campaign);
    // At t=0 the content phase has not elapsed, so status is PROCESSING
    expect(detail.status).toBe('PROCESSING');
  });
});
