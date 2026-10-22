import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import {
  ControlOutlined,
  DisconnectOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import Guacamole from 'guacamole-common-js';
import { useLocale } from '../../../context/LocaleContext';

// Guacamole.Client connection states.
const CONNECTED = 3;
const DISCONNECTED = 5;

/**
 * The live remote desktop. Connects guacamole-common-js to the portal's tunnel
 * (/api/app/remote/tunnel) with the one-time token from startSession, renders
 * the screen into a canvas and forwards input. In read-only mode no input is
 * sent (guacd also enforces it). The host address and credentials are inside
 * the token and never reach this code.
 */
export default function RemoteViewer({ token, path, hostName, readOnly, onClose }) {
  const { t } = useLocale();
  const stageRef = useRef(null);
  const clientRef = useRef(null);
  const [state, setState] = useState('connecting');
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const fit = useCallback(() => {
    const client = clientRef.current;
    const stage = stageRef.current;
    if (!client || !stage) return;
    const display = client.getDisplay();
    const w = display.getWidth();
    const h = display.getHeight();
    if (!w || !h) return;
    const scale = Math.min(stage.clientWidth / w, stage.clientHeight / h);
    display.scale(scale > 0 ? scale : 1);
  }, []);

  useEffect(() => {
    const wsBase = `${window.location.origin.replace(/^http/, 'ws')}${path}`;
    const tunnel = new Guacamole.WebSocketTunnel(wsBase);
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    const stage = stageRef.current;
    const element = client.getDisplay().getElement();
    stage.appendChild(element);

    client.onstatechange = (s) => {
      if (s === CONNECTED) setState('connected');
      else if (s === DISCONNECTED) setState('disconnected');
    };
    client.onerror = (status) => {
      setError(status?.message || t('remote.viewer.failed'));
      setState('disconnected');
    };
    client.getDisplay().onresize = fit;

    // Inbound clipboard: text copied inside the session → the local clipboard.
    client.onclipboard = (stream, mimetype) => {
      if (!/^text\//.test(mimetype)) return;
      const reader = new Guacamole.StringReader(stream);
      let text = '';
      reader.ontext = (chunk) => { text += chunk; };
      reader.onend = () => { navigator.clipboard?.writeText(text).catch(() => {}); };
    };

    const size = stageRef.current.getBoundingClientRect();
    const width = Math.max(640, Math.round(size.width));
    const height = Math.max(480, Math.round(size.height));
    client.connect(`token=${encodeURIComponent(token)}&GUAC_WIDTH=${width}&GUAC_HEIGHT=${height}&GUAC_DPI=96`);

    // Input (skipped in read-only mode).
    let mouse;
    let keyboard;
    if (!readOnly) {
      mouse = new Guacamole.Mouse(element);
      const send = (mouseState) => {
        client.getDisplay().showCursor(false);
        client.sendMouseState(mouseState);
      };
      mouse.onmousedown = send;
      mouse.onmouseup = send;
      mouse.onmousemove = send;
      keyboard = new Guacamole.Keyboard(document);
      keyboard.onkeydown = (keysym) => client.sendKeyEvent(1, keysym);
      keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym);
    }

    const onResize = () => { fit(); const r = stage.getBoundingClientRect(); client.sendSize(Math.round(r.width), Math.round(r.height)); };
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(fit);
    observer.observe(stage);

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      keyboard?.reset();
      if (keyboard) { keyboard.onkeydown = null; keyboard.onkeyup = null; }
      try { client.disconnect(); } catch { /* already gone */ }
      if (element.parentNode === stage) stage.removeChild(element);
      clientRef.current = null;
    };
  }, [token, path, readOnly, fit, t]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    const root = stageRef.current?.closest('.rm-viewer-overlay');
    if (!document.fullscreenElement) root?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const sendCtrlAltDel = () => {
    const client = clientRef.current;
    if (!client || readOnly) return;
    const keys = [0xffe3, 0xffe9, 0xffff]; // Ctrl, Alt, Delete
    keys.forEach((k) => client.sendKeyEvent(1, k));
    keys.reverse().forEach((k) => client.sendKeyEvent(0, k));
  };

  return (
    <div className="rm-viewer-overlay">
      <div className="rm-viewer-bar">
        <span className="rm-viewer-bar__title">
          <SafetyCertificateOutlined /> {hostName}
          <span className={`rm-viewer-bar__state is-${state}`}>
            {state === 'connected' ? t('remote.viewer.connected') : state === 'disconnected' ? t('remote.viewer.disconnected') : <><LoadingOutlined /> {t('remote.viewer.connecting')}</>}
          </span>
          {readOnly && <span className="rm-viewer-bar__ro">{t('remote.viewer.readOnly')}</span>}
        </span>
        <span className="rm-viewer-bar__tools">
          {!readOnly && (
            <Tooltip title="Ctrl+Alt+Del">
              <Button size="small" ghost icon={<ControlOutlined />} onClick={sendCtrlAltDel}>Ctrl+Alt+Del</Button>
            </Tooltip>
          )}
          <Tooltip title={fullscreen ? t('remote.viewer.exitFullscreen') : t('remote.viewer.fullscreen')}>
            <Button size="small" ghost icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} />
          </Tooltip>
          <Button size="small" danger type="primary" icon={<DisconnectOutlined />} onClick={onClose}>{t('remote.viewer.disconnect')}</Button>
        </span>
      </div>
      <div className="rm-viewer-stage" ref={stageRef}>
        {state !== 'connected' && (
          <div className="rm-viewer-status">
            {state === 'disconnected' ? (
              <>
                <p>{error || t('remote.viewer.ended')}</p>
                <Button onClick={onClose}>{t('remote.viewer.close')}</Button>
              </>
            ) : (
              <><LoadingOutlined style={{ fontSize: 28 }} /><p>{t('remote.viewer.connectingTo', { name: hostName })}</p></>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
