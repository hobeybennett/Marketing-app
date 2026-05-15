import { describe, it, expect } from 'vitest';
import { formatTime, initClips } from '@/lib/utils';

describe('formatTime', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats 65 seconds as 1:05', () => {
    expect(formatTime(65)).toBe('1:05');
  });

  it('formats 3600 seconds as 60:00', () => {
    expect(formatTime(3600)).toBe('60:00');
  });
});

describe('initClips', () => {
  it('returns an array of length 5 for a normal duration', () => {
    const clips = initClips(180);
    expect(clips).toHaveLength(5);
  });

  it('names clips Section 1 through Section 5', () => {
    const clips = initClips(180);
    expect(clips.map((c) => c.name)).toEqual([
      'Section 1',
      'Section 2',
      'Section 3',
      'Section 4',
      'Section 5',
    ]);
  });

  it('spaces startSec values evenly for duration 180 (step=36)', () => {
    const clips = initClips(180);
    // step = floor(180/5) = 36; max startSec = 180-30 = 150
    expect(clips.map((c) => c.startSec)).toEqual([0, 36, 72, 108, 144]);
  });

  it('no startSec exceeds duration - 30', () => {
    const clips = initClips(180);
    for (const clip of clips) {
      expect(clip.startSec).toBeLessThanOrEqual(150);
    }
  });

  it('all clips start at 0 for a very short track (duration=30)', () => {
    // step = floor(30/5) = 6; max = 30-30 = 0; so all clamped to 0
    const clips = initClips(30);
    for (const clip of clips) {
      expect(clip.startSec).toBe(0);
    }
  });

  it('handles zero duration safely', () => {
    // step = 0; max = max(0, -30) = 0; all start at 0
    const clips = initClips(0);
    expect(clips).toHaveLength(5);
    for (const clip of clips) {
      expect(clip.startSec).toBe(0);
    }
  });
});
