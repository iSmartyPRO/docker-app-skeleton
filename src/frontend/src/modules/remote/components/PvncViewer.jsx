import { useEffect, useRef, useState } from 'react';
import { App, Button, Tooltip } from 'antd';
import {
  ControlOutlined,
  DisconnectOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SnippetsOutlined,
  WarningFilled,
} from '@ant-design/icons';
import RFB from '@novnc/novnc/lib/rfb.js';
import { useLocale } from '../../../context/LocaleContext';

const CONNECT_TIMEOUT = 25000;

/**
 * Live viewer for Portal VNC agents. Unlike RemoteViewer (guacamole-common-js
 * over the guacd tunnel), this speaks noVNC/RFB directly over the portal's
 * PortalVNC bridge (/api/app/remote/pvnc), which carries raw RFB after the
 * agent's mutual-TLS handshake. Read-only here is noVNC `viewOnly` (client
 * side); the agent still authorises the operator by Windows account + SID.
 */
export default function PvncViewer({ token, path, hostName, readOnly, onClose, onRetry }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const screenRef = useRef(null);
  const rfbRef = useRef(null);
  const [phase, setPhase] = useState('tunnel'); // tunnel | connected | error
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return undefined;
    const url = `${window.location.origin.replace(/^http/, 'ws')}${path}?token=${encodeURIComponent(token)}`;

    let settled = false;
    const fail = (reason, detail) => { if (settled) return; settled = true; clearTimeout(timer); setError({ reason, detail }); setPhase('error'); };
    const timer = setTimeout(() => fail('timeout', t('remote.errors.noFrame')), CONNECT_TIMEOUT);

    let rfb;
    try {
      rfb = new RFB(screen, url, { shared: true });
    } catch (e) {
      fail('tunnel', e?.message);
      return () => clearTimeout(timer);
    }
    rfb.viewOnly = Boolean(readOnly);
    rfb.scaleViewport = true;   // fit the framebuffer to the container
    rfb.resizeSession = false;  // do not ask the desktop to change resolution
    rfb.focusOnClick = true;
    rfb.background = '#0b0d12';
    rfbRef.current = rfb;

    const onConnect = () => { settled = true; clearTimeout(timer); setPhase('connected'); };
    // The server-side bridge closes with a reason (invalid token, agent refused,
    // not configured); surface it. e.detail.clean=false means an abnormal close.
    const onDisconnect = (e) => {
      const reason = e?.detail?.clean ? 'closed' : 'server';
      fail(reason);
    };
    const onSecurityFailure = (e) => fail('auth', e?.detail?.reason);
    // Some agents present RFB security «None» (we already did Windows auth); if a
    // VNC password is demanded we have none to give — report an auth failure.
    const onCredentials = () => fail('auth');
    const onClipboard = (e) => { if (e?.detail?.text) navigator.clipboard?.writeText(e.detail.text).catch(() => {}); };

    rfb.addEventListener('connect', onConnect);
    rfb.addEventListener('disconnect', onDisconnect);
    rfb.addEventListener('securityfailure', onSecurityFailure);
    rfb.addEventListener('credentialsrequired', onCredentials);
    rfb.addEventListener('clipboard', onClipboard);

    return () => {
      clearTimeout(timer);
      rfb.removeEventListener('connect', onConnect);
      rfb.removeEventListener('disconnect', onDisconnect);
      rfb.removeEventListener('securityfailure', onSecurityFailure);
      rfb.removeEventListener('credentialsrequired', onCredentials);
      rfb.removeEventListener('clipboard', onClipboard);
      try { rfb.disconnect(); } catch { /* noop */ }
      rfbRef.current = null;
    };
  }, [token, path, readOnly, t]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const blur = (e) => e?.currentTarget?.blur?.();

  const toggleFullscreen = (e) => {
    blur(e);
    const root = screenRef.current?.closest('.rm-viewer-overlay');
    if (!document.fullscreenElement) root?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const sendCtrlAltDel = (e) => { blur(e); if (!readOnly) try { rfbRef.current?.sendCtrlAltDel(); } catch { /* noop */ } };

  const paste = async (e) => {
    blur(e);
    if (readOnly) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      rfbRef.current?.clipboardPasteFrom(text);
      message.success(t('remote.viewer.pasted'));
    } catch {
      message.error(t('remote.viewer.pasteFailed'));
    }
  };

  const phaseLabel =
    phase === 'connected' ? t('remote.viewer.connected') :
    phase === 'error' ? t('remote.viewer.disconnected') : t('remote.viewer.tunnel');

  return (
    <div className="rm-viewer-overlay">
      <div className="rm-viewer-bar">
        <span className="rm-viewer-bar__title">
          <SafetyCertificateOutlined /> {hostName}
          <span className="rm-proto rm-proto--pvnc">Portal VNC</span>
          <span className={`rm-viewer-bar__state is-${phase}`}>
            {phase !== 'connected' && phase !== 'error' && <LoadingOutlined />} {phaseLabel}
          </span>
          {readOnly && <span className="rm-viewer-bar__ro">{t('remote.viewer.readOnly')}</span>}
        </span>
        <span className="rm-viewer-bar__tools">
          {!readOnly && phase === 'connected' && (
            <>
              <Tooltip title={t('remote.viewer.paste')}>
                <Button size="small" ghost icon={<SnippetsOutlined />} onClick={paste} aria-label={t('remote.viewer.paste')} />
              </Tooltip>
              <Tooltip title="Ctrl+Alt+Del">
                <Button size="small" ghost icon={<ControlOutlined />} onClick={sendCtrlAltDel}>Ctrl+Alt+Del</Button>
              </Tooltip>
            </>
          )}
          <Tooltip title={fullscreen ? t('remote.viewer.exitFullscreen') : t('remote.viewer.fullscreen')}>
            <Button size="small" ghost icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} />
          </Tooltip>
          <Button size="small" danger type="primary" icon={<DisconnectOutlined />} onClick={onClose}>{t('remote.viewer.disconnect')}</Button>
        </span>
      </div>

      <div className="rm-viewer-stage">
        <div className="rm-viewer-novnc" ref={screenRef} />
        {phase !== 'connected' && (
          <div className="rm-viewer-status">
            {phase === 'error' ? (
              <>
                <WarningFilled className="rm-viewer-status__err" />
                <p className="rm-viewer-status__title">{t(`remote.errors.${error?.reason || 'server'}`)}</p>
                {error?.detail && <p className="rm-viewer-status__detail">{error.detail}</p>}
                <div className="rm-viewer-status__actions">
                  {onRetry && <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>{t('remote.viewer.retry')}</Button>}
                  <Button ghost onClick={onClose}>{t('remote.viewer.close')}</Button>
                </div>
              </>
            ) : (
              <>
                <LoadingOutlined style={{ fontSize: 30 }} />
                <p className="rm-viewer-status__title">{phaseLabel}</p>
                <p className="rm-viewer-status__detail">{t('remote.viewer.connectingTo', { name: hostName })}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
