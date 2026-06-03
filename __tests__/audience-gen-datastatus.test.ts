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

vi.mock('../lib/queue', () => ({ dispatchStage: mockDispatch }));
vi.mock('../workers/prisma', () => ({ prisma: mockPrisma }));

import { runAudienceGen } from '../workers/stages/audience-gen';

describe('runAudienceGen — dataStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue({ id: 'camp-1', autoLaunch: false });
  });

  it('sets INTEREST audience dataStatus to AVAILABLE', async () => {
    await runAudienceGen('camp-1');
    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    const interest = created.find((a) => a.type === 'INTEREST');
    expect(interest?.dataStatus).toBe('AVAILABLE');
  });

  it('sets RETARGETING audience dataStatus to PENDING_DATA', async () => {
    await runAudienceGen('camp-1');
    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    const retargeting = created.find((a) => a.type === 'RETARGETING');
    expect(retargeting?.dataStatus).toBe('PENDING_DATA');
  });

  it('sets LOOKALIKE audience dataStatus to PENDING_DATA', async () => {
    await runAudienceGen('camp-1');
    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    const lookalike = created.find((a) => a.type === 'LOOKALIKE');
    expect(lookalike?.dataStatus).toBe('PENDING_DATA');
  });

  it('sets availabilityNote on RETARGETING audience', async () => {
    await runAudienceGen('camp-1');
    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    const retargeting = created.find((a) => a.type === 'RETARGETING');
    expect(retargeting?.availabilityNote).toContain('100 landing page visitors');
  });

  it('sets availabilityNote on LOOKALIKE audience', async () => {
    await runAudienceGen('camp-1');
    const created: any[] = mockPrisma.audience.createMany.mock.calls[0][0].data;
    const lookalike = created.find((a) => a.type === 'LOOKALIKE');
    expect(lookalike?.availabilityNote).toContain('100 source audience members');
  });
});
