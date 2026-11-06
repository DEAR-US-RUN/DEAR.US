import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';

export type TransitionKind = 'route' | 'tab' | 'theme' | 'book';

type ViewTransitionHandle = {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
};

type DocumentWithVT = Document & {
  startViewTransition?: (updateCallback: () => void | Promise<void>) => ViewTransitionHandle;
};

/** Respect OS/browser reduced-motion preference everywhere in JS motion helpers. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Wrap a synchronous state/DOM update in the native View Transitions API when
 * supported, visible, and allowed by motion preferences. Falls back to an
 * immediate update with zero delay.
 */
export function runViewTransition(
  update: () => void,
  options: { kind?: TransitionKind; useFlushSync?: boolean } = {},
): void {
  const { kind = 'route', useFlushSync = true } = options;
  if (
    typeof document === 'undefined' ||
    prefersReducedMotion() ||
    document.visibilityState === 'hidden'
  ) {
    update();
    return;
  }
  const doc = document as DocumentWithVT;
  if (typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }

  const root = document.documentElement;
  root.dataset.vtKind = kind;
  try {
    const transition = doc.startViewTransition(() => {
      if (useFlushSync) {
        flushSync(update);
      } else {
        update();
      }
    });
    void transition.finished.catch(() => {}).finally(() => {
      if (root.dataset.vtKind === kind) delete root.dataset.vtKind;
    });
  } catch {
    if (root.dataset.vtKind === kind) delete root.dataset.vtKind;
    update();
  }
}

/** Helper to attach CSS `--i` stagger index cleanly in JSX. */
export function staggerStyle(index: number): CSSProperties {
  return { '--i': Math.min(Math.max(index, 0), 8) } as CSSProperties;
}

/**
 * Zero-rerender pointer-tracked spotlight & optional subtle 3D book-cover tilt.
 * Updates CSS custom properties directly on the DOM node via requestAnimationFrame.
 */
export function useSpotlightHandlers<T extends HTMLElement = HTMLElement>(options?: {
  tilt?: boolean;
  maxTiltDeg?: number;
}) {
  const tilt = options?.tilt ?? false;
  const maxTiltDeg = options?.maxTiltDeg ?? 2.6;
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (event.pointerType === 'touch' || prefersReducedMotion()) return;
      const target = event.currentTarget;
      const clientX = event.clientX;
      const clientY = event.clientY;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.round(clientX - rect.left);
        const y = Math.round(clientY - rect.top);
        target.style.setProperty('--spot-x', `${x}px`);
        target.style.setProperty('--spot-y', `${y}px`);
        target.style.setProperty('--spot-opacity', '1');
        if (tilt) {
          const nx = (x / rect.width - 0.5) * 2;
          const ny = (y / rect.height - 0.5) * 2;
          target.style.setProperty('--tilt-x', `${(-ny * maxTiltDeg).toFixed(2)}deg`);
          target.style.setProperty('--tilt-y', `${(nx * maxTiltDeg).toFixed(2)}deg`);
        }
      });
    },
    [tilt, maxTiltDeg],
  );

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      const target = event.currentTarget;
      target.style.setProperty('--spot-opacity', '0');
      if (tilt) {
        target.style.setProperty('--tilt-x', '0deg');
        target.style.setProperty('--tilt-y', '0deg');
      }
    },
    [tilt],
  );

  return { onPointerMove, onPointerLeave };
}

/**
 * Passive scroll + rAF reading progress bar updater (zero React re-renders).
 */
export function useScrollProgressBar() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof window === 'undefined') return;
    let rafId: number | null = null;

    const update = () => {
      rafId = null;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 24 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.setProperty('--reading-progress', ratio.toFixed(4));
      bar.dataset.visible = ratio > 0.01 ? 'true' : 'false';
    };

    const schedule = () => {
      if (rafId === null) rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return barRef;
}

/**
 * Shared single-rAF passive scroll parallax engine for illustrated diary banners.
 */
type ParallaxItem = { el: HTMLElement; maxShift: number };
const parallaxItems = new Set<ParallaxItem>();
let parallaxRaf: number | null = null;
let parallaxListening = false;

function runParallaxFrame() {
  parallaxRaf = null;
  if (typeof window === 'undefined') return;
  const reduced = prefersReducedMotion();
  const vh = window.innerHeight || 1;
  for (const item of parallaxItems) {
    if (reduced) {
      item.el.style.setProperty('--parallax-y', '0px');
      continue;
    }
    const rect = item.el.getBoundingClientRect();
    if (rect.bottom < -120 || rect.top > vh + 120) continue;
    const centerOffset = (rect.top + rect.height * 0.5 - vh * 0.5) / (vh * 0.65);
    const clamped = Math.max(-1, Math.min(1, centerOffset));
    item.el.style.setProperty('--parallax-y', `${(-clamped * item.maxShift).toFixed(1)}px`);
  }
}

function scheduleParallax() {
  if (parallaxRaf === null && typeof window !== 'undefined') {
    parallaxRaf = requestAnimationFrame(runParallaxFrame);
  }
}

function attachParallaxListeners() {
  if (parallaxListening || typeof window === 'undefined') return;
  parallaxListening = true;
  window.addEventListener('scroll', scheduleParallax, { passive: true });
  window.addEventListener('resize', scheduleParallax, { passive: true });
}

function detachParallaxListenersIfEmpty() {
  if (!parallaxListening || parallaxItems.size > 0 || typeof window === 'undefined') return;
  parallaxListening = false;
  if (parallaxRaf !== null) {
    cancelAnimationFrame(parallaxRaf);
    parallaxRaf = null;
  }
  window.removeEventListener('scroll', scheduleParallax);
  window.removeEventListener('resize', scheduleParallax);
}

export function useParallaxRef<T extends HTMLElement = HTMLElement>(maxShift = 20) {
  const itemRef = useRef<ParallaxItem | null>(null);

  useEffect(() => {
    return () => {
      if (itemRef.current) {
        parallaxItems.delete(itemRef.current);
        itemRef.current = null;
        detachParallaxListenersIfEmpty();
      }
    };
  }, []);

  return useCallback(
    (node: T | null) => {
      if (itemRef.current) {
        parallaxItems.delete(itemRef.current);
        itemRef.current = null;
      }
      if (!node) {
        detachParallaxListenersIfEmpty();
        return;
      }
      const entry: ParallaxItem = { el: node, maxShift };
      itemRef.current = entry;
      parallaxItems.add(entry);
      attachParallaxListeners();
      scheduleParallax();
    },
    [maxShift],
  );
}

/**
 * Passive scroll detector for the floating "Return to top of journal" pill.
 */
export function useScrollTopButton(threshold = 340) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId: number | null = null;
    const check = () => {
      rafId = null;
      const next = window.scrollY > threshold;
      setVisible(prev => (prev === next ? prev : next));
    };
    const onScroll = () => {
      if (rafId === null) rafId = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
    };
  }, [threshold]);

  const scrollToTop = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  return { visible, scrollToTop };
}

let sharedObserver: IntersectionObserver | null = null;
const observedCallbacks = new WeakMap<Element, () => void>();

function getSharedRevealObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            const cb = observedCallbacks.get(entry.target);
            observedCallbacks.delete(entry.target);
            sharedObserver?.unobserve(entry.target);
            cb?.();
          }
        }
      },
      { rootMargin: '0px 0px -4% 0px', threshold: 0.05 },
    );
  }
  return sharedObserver;
}

/**
 * Lightweight shared IntersectionObserver ref callback for scroll-revealed cards.
 * Marks the element `data-revealed="true"` once on first intersection and unobserves.
 */
export function useScrollRevealRef<T extends HTMLElement = HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;
    if (prefersReducedMotion()) {
      node.dataset.revealed = 'true';
      return;
    }
    const observer = getSharedRevealObserver();
    if (!observer) {
      node.dataset.revealed = 'true';
      return;
    }
    node.dataset.revealed = 'pending';
    observedCallbacks.set(node, () => {
      node.dataset.revealed = 'true';
    });
    observer.observe(node);
    cleanupRef.current = () => {
      observedCallbacks.delete(node);
      observer.unobserve(node);
    };
  }, []);
}
