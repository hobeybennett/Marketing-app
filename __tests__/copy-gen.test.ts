import { vi, describe, it, expect, beforeEach } from 'vitest';

// Set test API key before importing copy-gen module
process.env.ANTHROPIC_API_KEY = 'test-key';

// ── hoisted mock state ────────────────────────────────────────────────────────

const mockCreate = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const mockPrisma = vi.hoisted(() => ({
  campaign: { findUniqueOrThrow: vi.fn() },
  adCopy: {
    deleteMany: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../lib/queue', () => ({ dispatchStage: mockDispatch }));
vi.mock('../workers/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function stubFiveVariants() {
  const variants = Array.from({ length: 5 }, (_, i) => ({
    headline: `Headline ${i}`,
    primaryText: `Primary text ${i}`,
    description: `Description ${i}`,
  }));
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(variants) }],
  });
}

function mockCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    artistName: 'Jeff Buckley',
    songTitle: 'Hallelujah',
    soundsLike: [],
    promoteType: 'track',
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

import { runCopyGen } from '../workers/stages/copy-gen';

describe('runCopyGen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Claude API exactly once to generate all 5 variants', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFiveVariants();

    await runCopyGen('camp-1');

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('creates 5 AdCopy records — one per variant', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFiveVariants();

    await runCopyGen('camp-1');

    expect(mockPrisma.adCopy.create).toHaveBeenCalledTimes(5);
    const firstCall = mockPrisma.adCopy.create.mock.calls[0][0];
    expect(firstCall.data).toMatchObject({
      campaignId: 'camp-1',
      creativeId: null,
      isSelected: true, // first variant is selected by default
      headline: 'Headline 0',
      primaryText: 'Primary text 0',
    });
  });

  it('dispatches AUDIENCE_GEN after creating all variants', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFiveVariants();

    await runCopyGen('camp-1');

    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('camp-1', 'AUDIENCE_GEN');
  });

  it('deletes existing AdCopy records before creating new ones (idempotency)', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFiveVariants();

    await runCopyGen('camp-1');

    expect(mockPrisma.adCopy.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'camp-1' } });
    const deleteOrder = mockPrisma.adCopy.deleteMany.mock.invocationCallOrder[0];
    const firstCreateOrder = mockPrisma.adCopy.create.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(firstCreateOrder);
  });

  it('throws when Claude returns a non-JSON response', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }],
    });

    await expect(runCopyGen('camp-1')).rejects.toThrow(/No JSON array returned/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('includes artist name and song title in the Claude prompt', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(
      mockCampaign({ artistName: 'Radiohead', songTitle: 'Creep' }),
    );
    stubFiveVariants();

    await runCopyGen('camp-1');

    const promptText = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptText).toContain('Radiohead');
    expect(promptText).toContain('Creep');
  });
});
