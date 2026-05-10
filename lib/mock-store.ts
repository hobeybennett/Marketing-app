import { v4 as uuidv4 } from 'uuid';

export type MockCampaign = {
  id: string;
  artistName: string;
  songTitle: string;
  coverArtUrl: string;
  autoLaunch: boolean;
  createdAt: Date;
  campaignStartedAt?: Date;
  launchedAt?: Date;
};

const store = new Map<string, MockCampaign>();

// Phase 1: content generation (segmentation + video gen)
const SEGMENTATION_MS = 7000;
const VIDEO_GEN_MS = 10000;
const CONTENT_DONE_MS = SEGMENTATION_MS + VIDEO_GEN_MS;

// Phase 2: campaign building (copy gen + audience gen)
const COPY_GEN_MS = 6000;
const AUDIENCE_GEN_MS = 5000;
const CAMPAIGN_DONE_MS = COPY_GEN_MS + AUDIENCE_GEN_MS;

const CTA_OPTIONS = ['Listen Now', 'Stream Today', 'Out Now', 'Hear It First', 'Play Now'];

export const mockStore = {
  create(data: Omit<MockCampaign, 'id' | 'createdAt'>): MockCampaign {
    const campaign: MockCampaign = { ...data, id: uuidv4(), createdAt: new Date() };
    store.set(campaign.id, campaign);
    return campaign;
  },
  get: (id: string) => store.get(id),
  list: () => Array.from(store.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  startCampaignPhase(id: string) {
    const c = store.get(id);
    if (c) { c.campaignStartedAt = new Date(); store.set(id, c); }
  },
  launch(id: string) {
    const c = store.get(id);
    if (c) { c.launchedAt = new Date(); store.set(id, c); }
  },
};

export function buildMockDetail(campaign: MockCampaign) {
  const contentElapsed = Date.now() - campaign.createdAt.getTime();
  const contentDone = contentElapsed >= CONTENT_DONE_MS;

  const campaignElapsed = campaign.campaignStartedAt
    ? Date.now() - campaign.campaignStartedAt.getTime()
    : 0;
  const campaignDone = campaignElapsed >= CAMPAIGN_DONE_MS;

  // Content phase jobs
  const segStatus = contentElapsed >= SEGMENTATION_MS ? 'DONE' : 'RUNNING';
  const videoStatus = contentElapsed >= CONTENT_DONE_MS ? 'DONE' : contentElapsed >= SEGMENTATION_MS ? 'RUNNING' : 'PENDING';

  // Campaign phase jobs
  const copyStatus = !campaign.campaignStartedAt ? 'PENDING'
    : campaignElapsed >= COPY_GEN_MS ? 'DONE' : 'RUNNING';
  const audienceStatus = !campaign.campaignStartedAt ? 'PENDING'
    : campaignElapsed >= CAMPAIGN_DONE_MS ? 'DONE' : campaignElapsed >= COPY_GEN_MS ? 'RUNNING' : 'PENDING';

  const jobs = [
    { id: 'mock-seg', stage: 'SEGMENTATION', status: segStatus, error: null },
    { id: 'mock-vid', stage: 'VIDEO_GEN', status: videoStatus, error: null },
    { id: 'mock-copy', stage: 'COPY_GEN', status: copyStatus, error: null },
    { id: 'mock-aud', stage: 'AUDIENCE_GEN', status: audienceStatus, error: null },
  ];

  let status: string = 'PROCESSING';
  if (campaign.launchedAt) status = 'LIVE';
  else if (campaign.campaignStartedAt && campaignDone) status = 'READY';
  else if (campaign.campaignStartedAt) status = 'BUILDING';
  else if (contentDone) status = 'CONTENT_READY';

  const segments = contentDone ? Array.from({ length: 5 }, (_, i) => ({
    id: `mock-seg-${i}`,
    index: i,
    startSec: i * 30,
    endSec: (i + 1) * 30,
    fileUrl: `/uploads/mock/segment_${i}.mp3`,
  })) : [];

  const creatives = contentDone ? segments.map((seg, i) => ({
    id: `mock-creative-${i}`,
    segmentId: seg.id,
    ctaText: CTA_OPTIONS[i],
    fileUrl: `/uploads/mock/creative_${i}.mp4`,
    adCopies: campaignDone ? [{
      id: `mock-copy-${i}`,
      headline: `${campaign.songTitle} — Out Now`,
      primaryText: `${campaign.artistName} just dropped something you need to hear. Stream it now.`,
      description: 'Stream now',
    }] : [],
  })) : [];

  const audiences = campaignDone ? [
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
