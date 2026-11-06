import { forwardRef, useEffect } from 'react';
import type { CSSProperties, ImgHTMLAttributes } from 'react';
import { useTheme } from '../theme';

export type DiaryArtKey = 'desk' | 'connected' | 'personal' | 'vault' | 'signin';

export const DIARY_ART_PATHS: Record<DiaryArtKey, { light: string; dark: string }> = {
  desk: { light: '/images/desk-light.png', dark: '/images/desk-dark.png' },
  connected: { light: '/images/connected-light.png', dark: '/images/connected-dark.png' },
  personal: { light: '/images/personal-light.png', dark: '/images/personal-dark.png' },
  vault: { light: '/images/vault-light.png', dark: '/images/vault-dark.png' },
  signin: { light: '/images/signin-light.png', dark: '/images/signin-dark.png' },
};

const preloaded = new Set<string>();

function preloadCounterpart(src: string) {
  if (typeof window === 'undefined' || preloaded.has(src)) return;
  preloaded.add(src);
  const run = () => {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  };
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(run, { timeout: 2000 });
  } else {
    window.setTimeout(run, 600);
  }
}

export interface ThemedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  art: DiaryArtKey;
  style?: CSSProperties;
}

/**
 * Renders pixel-aligned Light / Dark PNG diary photography and preloads the
 * counterpart theme asset in idle time for instant zero-flicker theme switches.
 */
export const ThemedImage = forwardRef<HTMLImageElement, ThemedImageProps>(function ThemedImage(
  { art, alt = '', decoding = 'async', ...rest },
  ref,
) {
  const { resolved } = useTheme();
  const pair = DIARY_ART_PATHS[art];
  const src = resolved === 'dark' ? pair.dark : pair.light;
  const other = resolved === 'dark' ? pair.light : pair.dark;

  useEffect(() => {
    preloadCounterpart(other);
  }, [other]);

  return <img ref={ref} src={src} alt={alt} decoding={decoding} data-art={art} data-art-theme={resolved} {...rest} />;
});
