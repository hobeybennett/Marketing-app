import { VIBES } from './stock-video';

// The creative matrix: which visual "vibe" background pairs with which audio
// section. Shared by the renderer and the API (which reports the expected total
// so progress UI can count up to the right number).
//
//   VIDEO_VIBE_COUNT  distinct visual backgrounds (capped at the vibe library)
//   VIDEO_MATRIX=true every vibe × every section — 10 vibes × 5 sections = 50
//   default           one creative per vibe, sections rotating
export type RenderPlanEntry = { vibeIndex: number; segmentIndex: number };

// Platform defaults, in code rather than deployment config, so every
// environment and every new signup behaves the same without anyone having to
// remember a dashboard setting. 3 vibes x 5 sections = 15 creatives: enough
// variety for Meta to optimise across, comfortably inside its 50-ads-per-ad-set
// limit, and ~3 minutes to render. Env vars still override for experiments.
export const DEFAULT_VIBE_COUNT = 3;
export const DEFAULT_MATRIX_MODE = true;

export function vibeCountFor(_segmentCount: number): number {
  const configured = parseInt(process.env.VIDEO_VIBE_COUNT ?? '', 10);
  return Math.min(Math.max(1, configured || DEFAULT_VIBE_COUNT), VIBES.length);
}

export function isMatrixMode(): boolean {
  const raw = process.env.VIDEO_MATRIX;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return DEFAULT_MATRIX_MODE;
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
