import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import {
  ControlOutlined,
  DisconnectOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  WarningFilled,
} from '@ant-design/icons';
import Guacamole from 'guacamole-common-js';
import { useLocale } from '../../../context/LocaleContext';

const CONNECTED = 3;
const DISCONNECTED = 5;
const CONNECT_TIMEOUT = 25000;

// Guacamole status code → a human reason key. Codes seen from guacd for RDP/VNC.
const CODE_REASON = {
  0x0301: 'auth', 0x0303: 'auth', 0x0300: 'badRequest',
  0x0207: 'refused', 0x0208: 'refused', 0x0204: 'refused',
  0x0202: 'timeout', 0x020a: 'timeout', 0x0308: 'idle',
  0x0200: 'server', 0x0203: 'server', 0x0206: 'closed', 0x020b: 'closed',
};

/** Quality from processing lag (ms): 3 = great … 0 = poor. */
function signalLevel(lag) {
  if (lag == null) return null;
  if (lag < 60) return 3;
  if (lag < 150) return 2;
  if (lag < 350) return 1;
  return 0;
}

export default function RemoteViewer({ token, path, hostName, readOnly, onClose, onRetry }) {
  const { t } = useLocale();
  const stageRef = useRef(null);
  const clientRef = useRef(null);
  const [phase, setPhase] = useState('tunnel'); // tunnel | negotiate | connected | error
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [stats, setStats] = useState(null);

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
    const display = client.getDisplay();
    const element = display.getElement();
    stage.appendChild(element);

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { setError({ reason: 'timeout', detail: t('remote.errors.noFrame') }); setPhase('error'); try { client.disconnect(); } catch { /* noop */ } }
    }, CONNECT_TIMEOUT);

    const fail = (reason, detail) => {
      settled = true;
      clearTimeout(timer);
      setError({ reason, detail });
      setPhase('error');
    };

    client.onstatechange = (s) => {
      if (s === 1 || s === 2) setPhase('negotiate');
      else if (s === CONNECTED) { settled = true; clearTimeout(timer); setPhase('connected'); }
      else if (s === DISCONNECTED && !settled) fail('closed');
    };
    client.onerror = (status) => fail(CODE_REASON[status?.code] || 'server', status?.message);
    tunnel.onerror = (status) => fail(CODE_REASON[status?.code] || 'tunnel', status?.message);
    display.onresize = fit;

    // Live quality: processing lag and framerate.
    display.statisticWindow = 1000;
    display.onstatistics = (s) => setStats({ lag: Math.round(s.processingLag), fps: Math.round(s.clientFps || s.desktopFps || 0), drop: s.dropRate });

    // Inbound clipboard → local clipboard.
    client.onclipboard = (stream, mimetype) => {
      if (!/^text\//.test(mimetype)) return;
      const reader = new Guacamole.StringReader(stream);
      let text = '';
      reader.ontext = (chunk) => { text += chunk; };
      reader.onend = () => { navigator.clipboard?.writeText(text).catch(() => {}); };
    };

    const rect = stage.getBoundingClientRect();
    const width = Math.max(640, Math.round(rect.width));
    const height = Math.max(480, Math.round(rect.height));
    client.connect(`token=${encodeURIComponent(token)}&GUAC_WIDTH=${width}&GUAC_HEIGHT=${height}&GUAC_DPI=96`);

    let mouse;
    let keyboard;
    if (!readOnly) {
      mouse = new Guacamole.Mouse(element);
      const send = (s) => { display.showCursor(false); client.sendMouseState(s); };
      mouse.onmousedown = send; mouse.onmouseup = send; mouse.onmousemove = send;
      keyboard = new Guacamole.Keyboard(document);
      keyboard.onkeydown = (k) => client.sendKeyEvent(1, k);
      keyboard.onkeyup = (k) => client.sendKeyEvent(0, k);
    }

    const onResize = () => { fit(); const r = stage.getBoundingClientRect(); client.sendSize(Math.round(r.width), Math.round(r.height)); };
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(fit);
    observer.observe(stage);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      if (keyboard) { keyboard.reset(); keyboard.onkeydown = null; keyboard.onkeyup = null; }
      try { client.disconnect(); } catch { /* noop */ }
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
    const keys = [0xffe3, 0xffe9, 0xffff];
    keys.forEach((k) => client.sendKeyEvent(1, k));
    [...keys].reverse().forEach((k) => client.sendKeyEvent(0, k));
  };

  const level = stats ? signalLevel(stats.lag) : null;
  const phaseLabel =
    phase === 'connected' ? t('remote.viewer.connected') :
    phase === 'error' ? t('remote.viewer.disconnected') :
    phase === 'negotiate' ? t('remote.viewer.negotiate') : t('remote.viewer.tunnel');

  return (
    <div className="rm-viewer-overlay">
      <div className="rm-viewer-bar">
        <span className="rm-viewer-bar__title">
          <SafetyCertificateOutlined /> {hostName}
          <span className={`rm-viewer-bar__state is-${phase}`}>
            {phase !== 'connected' && phase !== 'error' && <LoadingOutlined />} {phaseLabel}
          </span>
          {readOnly && <span className="rm-viewer-bar__ro">{t('remote.viewer.readOnly')}</span>}
        </span>
        <span className="rm-viewer-bar__tools">
          {phase === 'connected' && stats && (
            <Tooltip title={t('remote.viewer.qualityHint', { lag: stats.lag, fps: stats.fps })}>
              <span className={`rm-signal is-${level}`} aria-label={t('remote.viewer.quality')}>
                <i /><i /><i />
                <span className="rm-signal__num">{stats.lag} {t('remote.viewer.ms')}</span>
              </span>
            </Tooltip>
          )}
          {!readOnly && phase === 'connected' && (
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
                <ol className="rm-viewer-steps">
                  <li className="is-done">{t('remote.viewer.stepReach')}</li>
                  <li className={phase === 'negotiate' ? 'is-active' : 'is-done'}>{t('remote.viewer.stepTunnel')}</li>
                  <li className={phase === 'negotiate' ? 'is-active' : ''}>{t('remote.viewer.stepNegotiate')}</li>
                </ol>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
