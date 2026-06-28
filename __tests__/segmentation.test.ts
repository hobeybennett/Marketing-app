import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── hoisted mock state ────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  campaign: { findUniqueOrThrow: vi.fn() },
  audioSegment: {
    deleteMany: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

const mockDispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// fluent-ffmpeg: makeChain is defined outside hoisted so it's available at module level
let ffmpegInstances: any[] = [];
function makeChain() {
  let endCb: (() => void) | null = null;
  const chain: any = {
    setStartTime: vi.fn().mockReturnThis(),
    setDuration: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation(function (event: string, cb: () => void) {
      if (event === 'end') endCb = cb;
      return chain;
    }),
    run: vi.fn().mockImplementation(() => { if (endCb) endCb(); }),
  };
  return chain;
}

const mockFfprobe = vi.hoisted(() => vi.fn());
const mockFfmpegFn = vi.hoisted(() => vi.fn());

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('fs', () => ({ mkdirSync: vi.fn() }));
vi.mock('../lib/queue', () => ({ dispatchStage: mockDispatch }));
vi.mock('../workers/prisma', () => ({ prisma: mockPrisma }));
vi.mock('fluent-ffmpeg', () => {
  (mockFfmpegFn as any).ffprobe = mockFfprobe;
  return { default: mockFfmpegFn };
});

// ── helpers ───────────────────────────────────────────────────────────────────

function mockCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    audioUrl: '/uploads/camp-1/audio.mp3',
    clipDefinitions: null,
    ...overrides,
  };
}

function stubFfprobe(duration: number) {
  mockFfprobe.mockImplementation(
    (_path: string, cb: (err: null, meta: object) => void) =>
      cb(null, { format: { duration } }),
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

import { runSegmentation } from '../workers/stages/segmentation';

describe('runSegmentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ffmpegInstances = [];
    mockFfmpegFn.mockImplementation(() => {
      const c = makeChain();
      ffmpegInstances.push(c);
      return c;
    });
    (mockFfmpegFn as any).ffprobe = mockFfprobe;
  });

  it('dispatches COPY_GEN after successful segmentation (fast stages run before video)', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFfprobe(180);

    await runSegmentation('camp-1');

    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith('camp-1', 'COPY_GEN');
  });

  it('creates exactly 5 AudioSegment records', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFfprobe(180);

    await runSegmentation('camp-1');

    expect(mockPrisma.audioSegment.create).toHaveBeenCalledTimes(5);
  });

  it('deletes existing segments before creating new ones (idempotency)', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFfprobe(180);

    await runSegmentation('camp-1');

    expect(mockPrisma.audioSegment.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'camp-1' } });
    const deleteOrder = mockPrisma.audioSegment.deleteMany.mock.invocationCallOrder[0];
    const firstCreateOrder = mockPrisma.audioSegment.create.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(firstCreateOrder);
  });

  it('throws when audio is shorter than 30 seconds', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFfprobe(20);

    await expect(runSegmentation('camp-1')).rejects.toThrow(/too short/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('respects clipDefinitions start times when provided', async () => {
    const clipDefs = [
      { startSec: 10 }, { startSec: 50 }, { startSec: 90 },
      { startSec: 130 }, { startSec: 170 },
    ];
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign({ clipDefinitions: clipDefs }));
    stubFfprobe(210);

    await runSegmentation('camp-1');

    const calls = mockPrisma.audioSegment.create.mock.calls;
    expect(calls[0][0].data.startSec).toBe(10);
    expect(calls[1][0].data.startSec).toBe(50);
    expect(calls[4][0].data.startSec).toBe(170);
  });

  it('spaces segments evenly when no clipDefinitions', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    stubFfprobe(150); // step = 30

    await runSegmentation('camp-1');

    const calls = mockPrisma.audioSegment.create.mock.calls;
    expect(calls[0][0].data.startSec).toBeCloseTo(0);
    expect(calls[1][0].data.startSec).toBeCloseTo(30);
    expect(calls[2][0].data.startSec).toBeCloseTo(60);
  });

  it('does not dispatch VIDEO_GEN when ffprobe fails', async () => {
    mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue(mockCampaign());
    mockFfprobe.mockImplementation(
      (_path: string, cb: (err: Error) => void) => cb(new Error('ffprobe failed')),
    );

    await expect(runSegmentation('camp-1')).rejects.toThrow('ffprobe failed');
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
