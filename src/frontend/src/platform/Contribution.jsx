import { Component, Suspense } from 'react';
import { isChunkError, isReloading, reloadOnce } from '../lib/chunkReload';
import { reportClientError } from '../lib/outage';

/*
 * One item of an extension point (platform/extensions.js) drawn in its own
 * error boundary and Suspense: a module's button, overlay or settings section
 * that fails to load or render disappears alone — the top bar, the page and
 * the other items keep working, and none waits for another's chunk.
 *
 *   {items.map(({ id, Component }) => (
 *     <Contribution key={id} point="header.actions" id={id}><Component /></Contribution>
 *   ))}
 */

class ContributionBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A chunk gone after a deploy: the page reloads once to pick up the new build (lib/chunkReload).
    if (isReloading() || (isChunkError(error) && reloadOnce())) return;
    const label = `${this.props.point}:${this.props.id}`;
    console.warn(`Extension ${label} failed to render; it is hidden`, error, info?.componentStack);
    reportClientError({ message: `[${label}] ${error?.message || error}`, stack: `${error?.stack || ''}\n${info?.componentStack || ''}` }, 'APP_EXTENSION_CRASH');
  }

  render() {
    if (this.state.error) return this.props.errorFallback ?? null;
    return this.props.children;
  }
}

export default function Contribution({ point, id, fallback = null, errorFallback = null, children }) {
  return (
    <ContributionBoundary point={point} id={id} errorFallback={errorFallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ContributionBoundary>
  );
}
