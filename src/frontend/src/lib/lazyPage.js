import { lazy } from 'react';

/**
 * React.lazy with a `preload()`: the launcher and the apps page start
 * fetching a module's code when the pointer rests on its tile (or it gets
 * keyboard focus), so the page is usually ready by the time of the click.
 * Preloading never throws; a failed fetch is retried by the real render.
 */
export function lazyPage(loader) {
  let pending = null;
  const load = () => {
    if (!pending) {
      pending = loader().catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
  const Component = lazy(load);
  Component.preload = () => {
    load().catch(() => {});
  };
  return Component;
}

/** Props for a link/button that preloads `module.App` on hover or focus. */
export function preloadProps(module) {
  const preload = () => module?.App?.preload?.();
  return { onMouseEnter: preload, onFocus: preload, onTouchStart: preload };
}
