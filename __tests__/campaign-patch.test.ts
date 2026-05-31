import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── hoisted mock state ────────────────────────────────────────────────────────

const mockDispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const mockPrisma = vi.hoisted(() => ({
  campaign: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  adCopy: { deleteMany: vi.fn().mockResolvedValue({}) },
  videoCreative: { deleteMany: vi.fn().mockResolvedValue({}) },
  audience: { deleteMany: vi.fn().mockResolvedValue({}) },
  audioSegment: { deleteMany: vi.fn().mockResolvedValue({}) },
  campaignJob: { deleteMany: vi.fn().mockResolvedValue({}) },
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/queue', () => ({ dispatchStage: mockDispatch }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth', () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock('fs/promises', () => ({ rm: vi.fn().mockResolvedValue(undefined) }));

// ── import under test ─────────────────────────────────────────────────────────

import { PATCH, DELETE } from '@/app/api/campaigns/[id]/route';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: object) {
  return { json: () => Promise.resolve(body) } as any;
}

function makeParams(id: string) {
  return { params: { id } };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/campaigns/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('action: continue', () => {
    it('returns 404 when campaign does not exist', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(null);

      const res = await PATCH(makeRequest({ action: 'continue' }), makeParams('missing'));

      expect(res.status).toBe(404);
    });

    it('returns 400 when campaign is not CONTENT_READY', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', status: 'PROCESSING' });

      const res = await PATCH(makeRequest({ action: 'continue' }), makeParams('c-1'));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('CONTENT_READY') });
    });

    it('sets status to BUILDING and dispatches COPY_GEN when CONTENT_READY', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', status: 'CONTENT_READY' });

      const res = await PATCH(makeRequest({ action: 'continue' }), makeParams('c-1'));

      expect(res.status).toBe(200);
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { status: 'BUILDING' },
      });
      expect(mockDispatch).toHaveBeenCalledWith('c-1', 'COPY_GEN');
    });
  });

  describe('action: launch', () => {
    it('returns 404 when campaign does not exist', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(null);

      const res = await PATCH(makeRequest({ action: 'launch' }), makeParams('missing'));

      expect(res.status).toBe(404);
    });

    it('returns 400 when campaign is not READY', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', status: 'BUILDING' });

      const res = await PATCH(makeRequest({ action: 'launch' }), makeParams('c-1'));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('READY') });
    });

    it('sets status to LAUNCHING and dispatches META_SETUP when READY', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', status: 'READY' });

      const res = await PATCH(makeRequest({ action: 'launch' }), makeParams('c-1'));

      expect(res.status).toBe(200);
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { status: 'LAUNCHING' },
      });
      expect(mockDispatch).toHaveBeenCalledWith('c-1', 'META_SETUP');
    });
  });

  describe('unknown action', () => {
    it('returns 400 for an unrecognised action', async () => {
      const res = await PATCH(makeRequest({ action: 'explode' }), makeParams('c-1'));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('unknown action') });
    });
  });
});

describe('DELETE /api/campaigns/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when campaign does not exist', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(null);

    const res = await DELETE({} as any, makeParams('missing'));

    expect(res.status).toBe(404);
  });

  it('returns 403 when a different user owns the campaign', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-b' } } as any);
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', userId: 'user-a' });

    const res = await DELETE({} as any, makeParams('c-1'));

    expect(res.status).toBe(403);
  });

  it('deletes all child records and the campaign itself', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', userId: null });

    const res = await DELETE({} as any, makeParams('c-1'));

    expect(res.status).toBe(200);
    expect(mockPrisma.adCopy.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'c-1' } });
    expect(mockPrisma.videoCreative.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'c-1' } });
    expect(mockPrisma.audience.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'c-1' } });
    expect(mockPrisma.audioSegment.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'c-1' } });
    expect(mockPrisma.campaignJob.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'c-1' } });
    expect(mockPrisma.campaign.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
  });

  it('allows deletion when the campaign owner matches the session user', async () => {
    const { getServerSession } = await import('@/lib/auth');
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-a' } } as any);
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: 'c-1', userId: 'user-a' });

    const res = await DELETE({} as any, makeParams('c-1'));

    expect(res.status).toBe(200);
    expect(mockPrisma.campaign.delete).toHaveBeenCalled();
  });
});
