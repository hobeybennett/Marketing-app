import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── hoisted mock state ────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  campaign: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  videoCreative: {
    deleteMany: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

const mockDispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFfmpegFn = vi.hoisted(() => vi.fn());

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('fs', () => ({ mkdirSync: vi.fn(), existsSync: vi.fn().mockReturnValue(true) }));
vi.mock('../lib/queue', () => ({ dispatchStage: mockDispatch }));
vi.mock('../workers/prisma', () => ({ prisma: mockPrisma }));
vi.mock('fluent-ffmpeg', () => ({ default: mockFfmpegFn }));

// ── chain factory (not hoisted — only needed at test runtime) ─────────────────

let chainInstances: any[] = [];

function makeChain() {
  let endCb: (() => void) | null = null;
  const chain: any = {
    loop: vi.fn().mockReturnThis(),
    input: vi.fn().mockReturnThis(),
    inputOptions: vi.fn().mockReturnThis(),
    videoFilters: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation(function (event: string, cb: () => void) {
      if (event === 'end') endCb = cb;
      return chain;
    }),
    run: vi.fn().mockImplementation(() => { if (endCb) endCb(); }),
  };
  return chain;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSegments(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    id: `seg-${i}`,
    index: i,
    fileUrl: `/uploads/camp-1/segments/segment_${i}.mp3`,
  }));
}

function mockCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    artistName: 'Jeff Buckley',
    songTitle: 'Hallelujah',
    coverArtUrl: '/uploads/camp-1/cover.jpg',
    autoLaunch: false,
    visualConfig: null,
    segments: makeSegments(),
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

import { runVideoGen } from '../workers/stages/video-gen';

describe('runVideoGen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainInstances = [];
    mockFfmpegFn.mockImplementation(() => {
      const c = makeChain();
      chainInstances.push(c);
      return c;
    });
  });

  it('creates exactly 5 VideoCreative records', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runVideoGen('camp-1');

    expect(mockPrisma.videoCreative.create).toHaveBeenCalledTimes(5);
  });

  it('sets campaign status to READY when autoLaunch is false (everything prepared)', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign({ autoLaunch: false }));

    await runVideoGen('camp-1');

    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'READY' },
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('sets campaign status to LAUNCHING and dispatches META_SETUP when autoLaunch is true', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign({ autoLaunch: true }));

    await runVideoGen('camp-1');

    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: 'LAUNCHING' },
    });
    expect(mockDispatch).toHaveBeenCalledWith('camp-1', 'META_SETUP');
  });

  it('deletes existing creatives before generating new ones (idempotency)', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runVideoGen('camp-1');

    expect(mockPrisma.videoCreative.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'camp-1' } });
    const deleteOrder = mockPrisma.videoCreative.deleteMany.mock.invocationCallOrder[0];
    const firstCreateOrder = mockPrisma.videoCreative.create.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(firstCreateOrder);
  });

  it('stores the correct output file path in each VideoCreative', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());

    await runVideoGen('camp-1');

    const calls = mockPrisma.videoCreative.create.mock.calls;
    calls.forEach((call: any[], i: number) => {
      expect(call[0].data.fileUrl).toContain(`creative_${i}.mp4`);
      expect(call[0].data.campaignId).toBe('camp-1');
    });
  });

  it('uses uploaded background path when bgMode is upload', async () => {
    const campaign = mockCampaign({
      visualConfig: { bgMode: 'upload', backgroundPath: '/uploads/camp-1/background.jpg' },
    });
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(campaign);

    await runVideoGen('camp-1');

    const firstChain = chainInstances[0];
    expect(firstChain.input).toHaveBeenCalledWith('/uploads/camp-1/background.jpg');
  });
});
