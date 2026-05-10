import { v4 as uuidv4 } from 'uuid';

export type MockCampaign = {
  id: string;
  artistName: string;
  songTitle: string;
  coverArtUrl: string;
  autoLaunch: boolean;
  createdAt: Date;
  launchedAt?: Date;
};

// In-memory store — resets on restart, fine for UX testing
const store = new Map<string, MockCampaign>();

const STAGE_DURATION_MS = 6000; // 6s per pipeline stage
const STAGES = ['SEGMENTATION', 'VIDEO_GEN', 'COPY_GEN', 'AUDIENCE_GEN'] as const;

export const mockStore = {
  create(data: Omit<MockCampaign, 'id' | 'createdAt'>): MockCampaign {
    const campaign: MockCampaign = { ...data, id: uuidv4(), createdAt: new Date() };
    store.set(campaign.id, campaign);
    return campaign;
  },

  get(id: string) {
    return store.get(id);
  },

  list() {
    return Array.from(store.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  },

  launch(id: string) {
    const c = store.get(id);
    if (c) { c.launchedAt = new Date(); store.set(id, c); }
  },
};

export function buildMockDetail(campaign: MockCampaign) {
  const elapsed = Date.now() - campaign.createdAt.getTime();
  const totalPipelineMs = STAGES.length * STAGE_DURATION_MS;
  const pipelineDone = elapsed >= totalPipelineMs;

  const jobs = STAGES.map((stage, i) => {
    const start = i * STAGE_DURATION_MS;
    const end = (i + 1) * STAGE_DURATION_MS;
    const status = elapsed >= end ? 'DONE' : elapsed >= start ? 'RUNNING' : 'PENDING';
    return { id: `mock-job-${stage}`, stage, status, error: null, createdAt: campaign.createdAt, updatedAt: new Date() };
  });

  let status = 'PROCESSING';
  if (campaign.launchedAt) status = 'LIVE';
  else if (pipelineDone) status = campaign.autoLaunch ? 'LIVE' : 'READY';

  const segments = pipelineDone ? Array.from({ length: 1 }, (_, i) => ({
    id: `mock-seg-${i}`,
    index: i,
    startSec: i * 30,
    endSec: (i + 1) * 30,
    fileUrl: `/uploads/mock/segment_${i}.mp3`,
  })) : [];

  const creatives = pipelineDone ? segments.map((seg, i) => ({
    id: `mock-creative-${i}`,
    segmentId: seg.id,
    ctaText: ['Listen Now', 'Stream Today', 'Out Now'][i % 3],
    fileUrl: `/uploads/mock/creative_${i}.mp4`,
    adCopies: [{
      id: `mock-copy-${i}`,
      headline: `${campaign.songTitle} — Out Now`,
      primaryText: `${campaign.artistName} just dropped something you need to hear. Stream it now.`,
      description: 'Stream now',
    }],
  })) : [];

  const audiences = pipelineDone ? [
    { id: 'mock-aud-1', name: 'Music Fans', type: 'INTEREST', interests: ['Music streaming', 'Spotify', 'Apple Music'], metaAdSetId: null },
    { id: 'mock-aud-2', name: 'Retargeting — Website Visitors', type: 'RETARGETING', interests: [], metaAdSetId: null },
    { id: 'mock-aud-3', name: 'Lookalike — 1% US', type: 'LOOKALIKE', interests: [], metaAdSetId: null },
  ] : [];

  return {
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
    status,
    metaCampaignId: campaign.launchedAt ? `mock_campaign_${campaign.id.slice(0, 8)}` : null,
    jobs,
    segments,
    creatives,
    audiences,
  };
}
