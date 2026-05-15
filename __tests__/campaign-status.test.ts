import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockStore, buildMockDetail, MockCampaign } from '@/lib/mock-store';

// Timing constants (mirror lib/mock-store.ts)
const SEGMENTATION_MS = 7000;
const VIDEO_GEN_MS = 10000;
const CONTENT_DONE_MS = SEGMENTATION_MS + VIDEO_GEN_MS; // 17000

const COPY_GEN_MS = 6000;
const AUDIENCE_GEN_MS = 5000;
const CAMPAIGN_DONE_MS = COPY_GEN_MS + AUDIENCE_GEN_MS; // 11000

function createTestCampaign(): MockCampaign {
  return mockStore.create({
    artistName: 'Status Test Artist',
    songTitle: 'Status Test Song',
    coverArtUrl: '/uploads/status-cover.jpg',
    autoLaunch: false,
  });
}

describe('campaign status progression', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('status is PROCESSING at t=0ms after creation', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const campaign = createTestCampaign();
    // createdAt is set by mockStore.create using `new Date()` which uses fake timer
    const detail = buildMockDetail(campaign);
    expect(detail.status).toBe('PROCESSING');
  });

  it('status is CONTENT_READY after SEGMENTATION_MS + VIDEO_GEN_MS have elapsed', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    const campaign = createTestCampaign();

    // Advance time past the content generation phase
    vi.setSystemTime(start + CONTENT_DONE_MS + 1);

    const detail = buildMockDetail(campaign);
    expect(detail.status).toBe('CONTENT_READY');
  });

  it('status is READY after startCampaignPhase + COPY_GEN_MS + AUDIENCE_GEN_MS have elapsed', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    const campaign = createTestCampaign();

    // Advance past content phase so we can trigger startCampaignPhase
    vi.setSystemTime(start + CONTENT_DONE_MS + 1);

    // Start the campaign building phase
    mockStore.startCampaignPhase(campaign.id);
    const campaignPhaseStart = Date.now();

    // Advance past the campaign building phase
    vi.setSystemTime(campaignPhaseStart + CAMPAIGN_DONE_MS + 1);

    const updatedCampaign = mockStore.get(campaign.id)!;
    const detail = buildMockDetail(updatedCampaign);
    expect(detail.status).toBe('READY');
  });

  it('status is BUILDING during campaign phase (before CAMPAIGN_DONE_MS)', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    const campaign = createTestCampaign();

    // Advance past content phase
    vi.setSystemTime(start + CONTENT_DONE_MS + 1);

    // Start campaign building phase
    mockStore.startCampaignPhase(campaign.id);
    const campaignPhaseStart = Date.now();

    // Advance only partway through campaign building phase
    vi.setSystemTime(campaignPhaseStart + COPY_GEN_MS - 1);

    const updatedCampaign = mockStore.get(campaign.id)!;
    const detail = buildMockDetail(updatedCampaign);
    expect(detail.status).toBe('BUILDING');
  });

  it('status is LIVE after launch', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    const campaign = createTestCampaign();

    // Advance past all phases and launch
    vi.setSystemTime(start + CONTENT_DONE_MS + 1);
    mockStore.startCampaignPhase(campaign.id);
    vi.setSystemTime(start + CONTENT_DONE_MS + CAMPAIGN_DONE_MS + 2);
    mockStore.launch(campaign.id);

    const updatedCampaign = mockStore.get(campaign.id)!;
    const detail = buildMockDetail(updatedCampaign);
    expect(detail.status).toBe('LIVE');
  });
});
