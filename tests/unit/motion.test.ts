import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, runViewTransition, staggerStyle } from '../../src/motion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lightweight motion helpers', () => {
  it('clamps stagger index within [0, 8]', () => {
    expect(staggerStyle(-3)).toEqual({ '--i': 0 });
    expect(staggerStyle(4)).toEqual({ '--i': 4 });
    expect(staggerStyle(25)).toEqual({ '--i': 8 });
  });

  it('safely defaults prefersReducedMotion to false without window.matchMedia', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('respects prefers-reduced-motion media query when active', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: query.includes('reduce') }),
    });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('runs update synchronously when View Transitions API is unavailable or reduced motion is enabled', () => {
    let count = 0;
    runViewTransition(() => {
      count += 1;
    });
    expect(count).toBe(1);

    const startViewTransition = vi.fn();
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      documentElement: { dataset: {} },
      startViewTransition,
    });
    runViewTransition(() => {
      count += 1;
    }, { kind: 'theme', useFlushSync: false });
    expect(count).toBe(2);
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it('tags documentElement with data-vt-kind and cleans it up when transition finishes', async () => {
    let resolveFinished!: () => void;
    const finished = new Promise<void>(resolve => {
      resolveFinished = resolve;
    });
    const dataset: Record<string, string> = {};
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {
        finished,
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => {},
      };
    });

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      documentElement: { dataset },
      startViewTransition,
    });

    let updated = false;
    runViewTransition(
      () => {
        updated = true;
      },
      { kind: 'tab', useFlushSync: false },
    );

    expect(updated).toBe(true);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(dataset.vtKind).toBe('tab');

    resolveFinished();
    await finished;
    await Promise.resolve();
    expect(dataset.vtKind).toBeUndefined();
  });
});
