import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── hoisted mock state ────────────────────────────────────────────────────────

const mockDispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const mockPrisma = vi.hoisted(() => ({
  campaign: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  audience: {
    deleteMany: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../lib/queue', () => ({ dispatchStage: mockDispatch }));
vi.mock('../workers/prisma', () => ({ prisma: mockPrisma }));

// ── helpers ───────────────────────────────────────────────────────────────────

function mockCampaign(autoLaunch = false) {
  return { id: 'camp-1', autoLaunch, artistName: 'Test Artist', soundsLike: ['Test Band'] };
}

// ── tests ─────────────────────────────────────────────────────────────────────

import { runAudienceGen } from '../workers/stages/audience-gen';

describe('runAudienceGen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a single AVAILABLE interest audience', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runAudienceGen('camp-1');

    expect(mockPrisma.audience.create).toHaveBeenCalledTimes(1);
    const created = mockPrisma.audience.create.mock.calls[0][0].data;
    expect(created.type).toBe('INTEREST');
    expect(created.dataStatus).toBe('AVAILABLE');
    expect(created.campaignId).toBe('camp-1');
  });

  it('uses soundsLike as the interests', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runAudienceGen('camp-1');

    const created = mockPrisma.audience.create.mock.calls[0][0].data;
    expect(created.interests).toEqual(['Test Band']);
  });

  it('dispatches VIDEO_GEN next (slow stage runs last) when autoLaunch is false', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign(false));

    await runAudienceGen('camp-1');

    expect(mockDispatch).toHaveBeenCalledWith('camp-1', 'VIDEO_GEN');
  });

  it('dispatches VIDEO_GEN next regardless of autoLaunch', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign(true));

    await runAudienceGen('camp-1');

    expect(mockDispatch).toHaveBeenCalledWith('camp-1', 'VIDEO_GEN');
  });

  it('deletes existing audiences before creating new ones (idempotency)', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runAudienceGen('camp-1');

    expect(mockPrisma.audience.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'camp-1' } });
    const deleteOrder = mockPrisma.audience.deleteMany.mock.invocationCallOrder[0];
    const createOrder = mockPrisma.audience.create.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('falls back to generic interests when soundsLike is empty', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue({
      id: 'camp-1', autoLaunch: false, artistName: 'Test Artist', soundsLike: [],
    });

    await runAudienceGen('camp-1');

    const created = mockPrisma.audience.create.mock.calls[0][0].data;
    expect(created.interests.length).toBeGreaterThan(0);
  });
});
