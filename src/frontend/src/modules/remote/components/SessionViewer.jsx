import { lazy, Suspense } from 'react';

/*
 * The live viewer of a session, loaded when a session opens: guacamole-common-js
 * (RemoteViewer, ~70 KB) and noVNC (PvncViewer, ~290 KB) are bundled into the
 * package's own chunks, so the Remote access pages open without them.
 */
const RemoteViewer = lazy(() => import('./RemoteViewer'));
const PvncViewer = lazy(() => import('./PvncViewer'));

export default function SessionViewer({ viewer, ...props }) {
  const Viewer = viewer === 'pvnc' ? PvncViewer : RemoteViewer;
  return (
    <Suspense fallback={null}>
      <Viewer {...props} />
    </Suspense>
  );
}
