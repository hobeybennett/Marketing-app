import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../prisma';

// Storage retention. Rendered videos are the bulk of disk use (~300MB for a
// full creative matrix) but Meta hosts its own copies once a campaign launches,
// so the local files only power preview thumbnails in the dashboard. Keeping
// them forever means disk grows with EVERY campaign ever run; pruning old ones
// caps usage at roughly the campaigns someone is actually still looking at.
//
// Deliberately kept:
//   cover.jpg  — the smart-link landing page serves it, and those links live on
//                long after a campaign ends
//   audio.*    — duplicating a campaign copies the source track
const PRUNE_DIRS = ['videos', 'segments'];

// Only campaigns that have actually run. READY campaigns haven't launched, so
// the artist may still be reviewing the videos.
const PRUNABLE_STATUSES = new Set(['LIVE', 'PAUSED', 'FAILED']);

export function retentionDays(): number {
  const raw = parseInt(process.env.VIDEO_RETENTION_DAYS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

// Is this campaign's rendered content old enough to drop?
export function isPrunable(
  status: string,
  createdAt: Date,
  now: Date = new Date(),
  days: number = retentionDays(),
): boolean {
  if (!PRUNABLE_STATUSES.has(status)) return false;
  const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
  return ageDays >= days;
}

function dirSize(p: string): number {
  try {
    const st = fs.statSync(p);
    if (st.isFile()) return st.size;
    if (st.isDirectory()) {
      return fs.readdirSync(p).reduce((sum, name) => sum + dirSize(path.join(p, name)), 0);
    }
  } catch { /* gone */ }
  return 0;
}

export async function runRetention(): Promise<{ scanned: number; pruned: number; freedMB: number }> {
  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const days = retentionDays();
  const now = new Date();

  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ['LIVE', 'PAUSED', 'FAILED'] } },
    select: { id: true, status: true, createdAt: true },
  });

  let pruned = 0;
  let freed = 0;

  for (const c of campaigns) {
    if (!isPrunable(c.status, c.createdAt, now, days)) continue;
    let freedHere = 0;
    for (const name of PRUNE_DIRS) {
      const target = path.join(uploadDir, c.id, name);
      if (!fs.existsSync(target)) continue;
      const bytes = dirSize(target);
      try {
        fs.rmSync(target, { recursive: true, force: true });
        freedHere += bytes;
      } catch (err) {
        console.warn(`[retention] failed to prune ${target}:`, err instanceof Error ? err.message : err);
      }
    }
    if (freedHere > 0) {
      pruned++;
      freed += freedHere;
      console.log(`[retention] pruned campaign ${c.id} (${c.status}) — freed ${(freedHere / 1e6).toFixed(1)}MB`);
    }
  }

  const freedMB = +(freed / 1e6).toFixed(1);
  console.log(`[retention] scanned ${campaigns.length} campaign(s), pruned ${pruned}, freed ${freedMB}MB (keeping ${days} days)`);
  return { scanned: campaigns.length, pruned, freedMB };
}
