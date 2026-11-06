import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIARY_ART_PATHS, type DiaryArtKey } from '../../src/components/ThemedImage';
import { JOURNAL_PROMPTS } from '../../src/components/StationeryControls';

describe('tactile diary artwork & stationery assets', () => {
  const keys: DiaryArtKey[] = ['desk', 'connected', 'personal', 'vault', 'signin'];

  it('provides matched light and dark lightweight PNG assets (<500 KB each) for every scene', () => {
    for (const key of keys) {
      const pair = DIARY_ART_PATHS[key];
      expect(pair.light).toMatch(/^\/images\/[a-z]+-light\.png$/);
      expect(pair.dark).toMatch(/^\/images\/[a-z]+-dark\.png$/);

      for (const rel of [pair.light, pair.dark]) {
        const diskPath = path.resolve(process.cwd(), 'public', rel.replace(/^\//, ''));
        expect(fs.existsSync(diskPath)).toBe(true);
        const stat = fs.statSync(diskPath);
        expect(stat.size).toBeGreaterThan(10_000);
        expect(stat.size).toBeLessThan(500 * 1024);
      }
    }
  });

  it('supplies non-empty journaling prompts for the writing spark slip', () => {
    expect(JOURNAL_PROMPTS.length).toBeGreaterThanOrEqual(5);
    for (const prompt of JOURNAL_PROMPTS) {
      expect(prompt.trim().length).toBeGreaterThan(12);
    }
  });
});
