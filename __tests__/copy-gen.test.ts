import { vi, describe, it, expect, beforeEach } from 'vitest';

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

function stubClaudeResponse(json: object) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(json) }],
  });
}

function mockCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    artistName: 'Jeff Buckley',
    songTitle: 'Hallelujah',
    creatives: [
      { id: 'c-0', ctaText: 'Listen Now' },
      { id: 'c-1', ctaText: 'Stream Today' },
    ],
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

import { runCopyGen } from '../workers/stages/copy-gen';

describe('runCopyGen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Claude API once per creative', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubClaudeResponse({ headline: 'H', primaryText: 'P', description: 'D' });

    await runCopyGen('camp-1');

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('creates an AdCopy record for each creative with parsed fields', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubClaudeResponse({ headline: 'Feel the Music', primaryText: 'Stream now.', description: 'Out now' });

    await runCopyGen('camp-1');

    expect(mockPrisma.adCopy.create).toHaveBeenCalledTimes(2);
    const firstCall = mockPrisma.adCopy.create.mock.calls[0][0];
    expect(firstCall.data).toMatchObject({
      campaignId: 'camp-1',
      headline: 'Feel the Music',
      primaryText: 'Stream now.',
      description: 'Out now',
    });
  });

  it('dispatches AUDIENCE_GEN after processing all creatives', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubClaudeResponse({ headline: 'H', primaryText: 'P' });

    await runCopyGen('camp-1');

    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('camp-1', 'AUDIENCE_GEN');
  });

  it('deletes existing AdCopy records before creating new ones (idempotency)', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubClaudeResponse({ headline: 'H', primaryText: 'P' });

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

    await expect(runCopyGen('camp-1')).rejects.toThrow(/No JSON returned/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('includes artist name and song title in the Claude prompt', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(
      mockCampaign({ artistName: 'Radiohead', songTitle: 'Creep' }),
    );
    stubClaudeResponse({ headline: 'H', primaryText: 'P' });

    await runCopyGen('camp-1');

    const promptText = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptText).toContain('Radiohead');
    expect(promptText).toContain('Creep');
  });
});
