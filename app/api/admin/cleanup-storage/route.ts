import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat, rm } from 'fs/promises';
import { existsSync, statfsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Campaigns still mid-pipeline need their source files — never touch these.
const IN_FLIGHT = new Set(['PROCESSING', 'BUILDING', 'LAUNCHING']);

// Intermediate files safe to delete once a campaign is past content generation.
// cover.jpg is intentionally KEPT — the smart-link landing page serves it.
const PRUNE = ['audio.mp3', 'audio.wav', 'audio.m4a', 'segments', 'videos', 'background.jpg', 'background.png', 'background.mp4'];

async function pathSize(p: string): Promise<number> {
  try {
    const st = await stat(p);
    if (st.isFile()) return st.size;
    if (st.isDirectory()) {
      let total = 0;
      for (const name of await readdir(p)) total += await pathSize(path.join(p, name));
      return total;
    }
  } catch { /* gone / unreadable */ }
  return 0;
}

// GET /api/admin/cleanup-storage        → dry run (preview what would be freed)
// GET /api/admin/cleanup-storage?confirm=yes → actually delete
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const confirm = new URL(req.url).searchParams.get('confirm') === 'yes';

  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  if (!existsSync(uploadDir)) {
    return NextResponse.json({ error: `uploadDir ${uploadDir} does not exist` }, { status: 500 });
  }

  const dirs = (await readdir(uploadDir, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.'));
  const campaigns = await prisma.campaign.findMany({ select: { id: true, status: true } });
  const statusById = new Map(campaigns.map((c) => [c.id, c.status]));

  const targets: { path: string; bytes: number; reason: string }[] = [];
  for (const d of dirs) {
    const dirPath = path.join(uploadDir, d.name);
    const status = statusById.get(d.name);
    if (!status) {
      targets.push({ path: dirPath, bytes: await pathSize(dirPath), reason: 'orphan (no DB campaign)' });
    } else if (!IN_FLIGHT.has(status)) {
      for (const name of PRUNE) {
        const target = path.join(dirPath, name);
        if (existsSync(target)) targets.push({ path: target, bytes: await pathSize(target), reason: `${status}: ${name}` });
      }
    }
  }

  const totalBytes = targets.reduce((s, t) => s + t.bytes, 0);

  if (!confirm) {
    return NextResponse.json({
      dryRun: true, wouldFreeMB: +(totalBytes / 1e6).toFixed(1), items: targets.length,
      sample: targets.slice(0, 30).map((t) => ({ ...t, MB: +(t.bytes / 1e6).toFixed(2) })),
    });
  }

  let freed = 0, deleted = 0;
  for (const t of targets) {
    try { await rm(t.path, { recursive: true, force: true }); freed += t.bytes; deleted++; } catch { /* skip */ }
  }

  let remainingFreeMB: number | null = null;
  try { const s = statfsSync(uploadDir); remainingFreeMB = +((s.bfree * s.bsize) / 1e6).toFixed(1); } catch { /* unsupported */ }

  return NextResponse.json({ deleted, freedMB: +(freed / 1e6).toFixed(1), remainingFreeMB });
}
