export function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export type Clip = { name: string; startSec: number };

export function initClips(duration: number): Clip[] {
  const step = Math.floor(duration / 5);
  return Array.from({ length: 5 }, (_, i) => ({
    name: `Section ${i + 1}`,
    startSec: Math.min(i * step, Math.max(0, duration - 30)),
  }));
}
