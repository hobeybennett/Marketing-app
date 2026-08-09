import { VIBES } from './stock-video';

// The creative matrix: which visual "vibe" background pairs with which audio
// section. Shared by the renderer and the API (which reports the expected total
// so progress UI can count up to the right number).
//
//   VIDEO_VIBE_COUNT  distinct visual backgrounds (capped at the vibe library)
//   VIDEO_MATRIX=true every vibe × every section — 10 vibes × 5 sections = 50
//   default           one creative per vibe, sections rotating
export type RenderPlanEntry = { vibeIndex: number; segmentIndex: number };

export function vibeCountFor(segmentCount: number): number {
  const configured = parseInt(process.env.VIDEO_VIBE_COUNT ?? '', 10);
  const fallback = segmentCount || 5;
  return Math.min(Math.max(1, configured || fallback), VIBES.length);
}

export function isMatrixMode(): boolean {
  return process.env.VIDEO_MATRIX === 'true';
}

export function buildRenderPlan(segmentCount: number): RenderPlanEntry[] {
  const vibes = vibeCountFor(segmentCount);
  const sections = Math.max(1, segmentCount);
  const plan: RenderPlanEntry[] = [];

  if (isMatrixMode()) {
    for (let v = 0; v < vibes; v++) {
      for (let s = 0; s < sections; s++) plan.push({ vibeIndex: v, segmentIndex: s });
    }
  } else {
    for (let v = 0; v < vibes; v++) plan.push({ vibeIndex: v, segmentIndex: v % sections });
  }
  return plan;
}
