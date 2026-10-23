import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';
import SessionViewer from './SessionViewer';
import ConnectDialog from './ConnectDialog';

/**
 * One-click connect. A request is { host, app, mode, ask? }. When the target's
 * default credential source is «ask», or `ask` is forced (menu → connect with
 * credentials), the full dialog opens; otherwise the session starts immediately
 * with the configured defaults and the viewer opens. The gear (host/app editor)
 * holds the connection settings, so launching is a single click.
 */
export default function Launcher({ request, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [session, setSession] = useState(null);
  const startedFor = useRef(null);

  const holder = request?.app || request?.host || null;
  const mode = request?.mode || 'assist';
  const needsDialog = Boolean(request) && (request.ask || holder?.defaultCred === 'ask');

  const launch = async (req) => {
    const h = req.app || req.host;
    const control = req.mode === 'monitor' ? false : true;
    try {
      const res = await remoteApi.start({
        hostId: req.app ? undefined : req.host.id,
        appId: req.app?.id,
        mode: req.app ? 'assist' : req.mode,
        control,
        width: Math.round(window.innerWidth * 0.95),
        height: Math.round((window.innerHeight - 48) * 0.98),
      });
      if (res.data.tunnel === 'READY') {
        setSession({ ...res.data, hostName: req.app ? `${req.app.name} · ${req.app.address}` : req.host.name });
      } else {
        message.info(res.data.tunnel === 'PVNC_OFF' ? t('remote.pvnc.offNotice') : t('remote.connect.pilotTitle'));
        if (res.data.session?.id) remoteApi.end(res.data.session.id).catch(() => {});
        onClose();
      }
    } catch (err) {
      message.error(errorMessage(err));
      onClose();
    }
  };

  // Auto-start for the direct (one-click) path, once per request.
  useEffect(() => {
    if (!request || needsDialog) { if (!request) { startedFor.current = null; setSession(null); } return; }
    const key = `${request.app?.id || 'h'}-${request.host?.id}-${request.mode}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    launch(request);
  }, [request, needsDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    if (session?.session?.id) await remoteApi.end(session.session.id).catch(() => {});
    startedFor.current = null;
    setSession(null);
    onClose();
  };

  if (needsDialog) {
    return <ConnectDialog open onClose={onClose} host={request.host} app={request.app} mode={mode} />;
  }
  if (session?.tunnel === 'READY') {
    return (
      <SessionViewer
        viewer={session.viewer}
        token={session.token}
        path={session.path}
        hostName={session.hostName}
        readOnly={session.readOnly}
        onClose={finish}
        onRetry={() => { startedFor.current = null; setSession(null); launch(request); }}
      />
    );
  }
  return null;
}
