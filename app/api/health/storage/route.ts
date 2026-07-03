import { NextResponse } from 'next/server';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync, statfsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Diagnoses the upload storage the web service can actually see. Hit this to
// tell apart: volume not mounted (ENOENT), read-only (EROFS), permissions
// (EACCES), full disk (ENOSPC), or wrong UPLOAD_DIR path.
export async function GET() {
  const uploadDir = process.env.UPLOAD_DIR || '/uploads';
  const parent = path.dirname(uploadDir);

  const result: Record<string, unknown> = {
    uploadDir,
    uploadDirExists: existsSync(uploadDir),
    parent,
    parentExists: existsSync(parent),
    uploadDirEnvSet: !!process.env.UPLOAD_DIR,
  };

  try {
    const s = statfsSync(existsSync(uploadDir) ? uploadDir : parent);
    result.freeBytes = s.bfree * s.bsize;
    result.totalBytes = s.blocks * s.bsize;
  } catch { /* statfs unsupported — ignore */ }

  try {
    const testDir = path.join(uploadDir, '.healthcheck');
    await mkdir(testDir, { recursive: true });
    await writeFile(path.join(testDir, 'probe.txt'), 'ok');
    await rm(testDir, { recursive: true, force: true });
    result.writable = true;
  } catch (err) {
    result.writable = false;
    result.errorCode = (err as NodeJS.ErrnoException)?.code ?? null;
    result.error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result);
}
