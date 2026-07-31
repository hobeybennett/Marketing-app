// Feature flags. Deliberately simple — flip and deploy.

// The $1.99 AI-background upsell (prompt → fal.ai clip → re-render ads).
// Hidden while we focus on core customers/feedback; the full flow (UI card,
// checkout, worker stages) is intact — set true to bring it back.
export const AI_VIDEO_ENABLED = false;
