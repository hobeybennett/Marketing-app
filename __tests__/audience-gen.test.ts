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
    createMany: vi.fn().mockResolvedValue({}),
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

  it('creates exactly 3 audiences', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runAudienceGen('camp-1');

    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(3);
  });

  it('creates one of each audience type', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runAudienceGen('camp-1');

    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    const types = created.map((a) => a.type).sort();
    expect(types).toEqual(['INTEREST', 'LOOKALIKE', 'RETARGETING']);
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
    const createOrder = mockPrisma.audience.createMany.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('all audiences belong to the correct campaign', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runAudienceGen('camp-1');

    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    for (const aud of created) {
      expect(aud.campaignId).toBe('camp-1');
    }
  });
});
