import { useCallback, useEffect, useRef, useState } from 'react';
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
import Guacamole from 'guacamole-common-js';
import { useLocale } from '../../../context/LocaleContext';

const CONNECTED = 3;
const DISCONNECTED = 5;
const CONNECT_TIMEOUT = 25000;
const DPR = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
const COARSE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;

const CODE_REASON = {
  0x0301: 'auth', 0x0303: 'auth', 0x0300: 'badRequest',
  0x0207: 'refused', 0x0208: 'refused', 0x0204: 'refused',
  0x0202: 'timeout', 0x020a: 'timeout', 0x0308: 'idle',
  0x0200: 'server', 0x0203: 'server', 0x0206: 'closed', 0x020b: 'closed',
};

// Backspace, Enter and a Unicode codepoint → X11 keysym.
const BACKSPACE = 0xff08;
const ENTER = 0xff0d;
const keysymOf = (cp) => (cp >= 0x20 && cp <= 0xff ? cp : 0x01000000 + cp);

function signalLevel(lag) {
  if (lag == null) return null;
  if (lag < 60) return 3;
  if (lag < 150) return 2;
  if (lag < 350) return 1;
  return 0;
}

function debounce(fn, ms) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export default function RemoteViewer({ token, path, hostName, readOnly, onClose, onRetry }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const stageRef = useRef(null);
  const inputRef = useRef(null);
  const clientRef = useRef(null);
  const [phase, setPhase] = useState('tunnel');
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
    const fail = (reason, detail) => { settled = true; clearTimeout(timer); setError({ reason, detail }); setPhase('error'); };

    client.onstatechange = (s) => {
      if (s === 1 || s === 2) setPhase('negotiate');
      else if (s === CONNECTED) { settled = true; clearTimeout(timer); setPhase('connected'); }
      else if (s === DISCONNECTED && !settled) fail('closed');
    };
    client.onerror = (status) => fail(CODE_REASON[status?.code] || 'server', status?.message);
    tunnel.onerror = (status) => fail(CODE_REASON[status?.code] || 'tunnel', status?.message);

    // Server-drawn cursor → CSS cursor (point 6); draw it ourselves, not per-move.
    display.showCursor(false);
    display.oncursor = (canvas, hotspotX, hotspotY) => {
      try { stage.style.cursor = `url("${canvas.toDataURL()}") ${hotspotX} ${hotspotY}, auto`; } catch { stage.style.cursor = 'default'; }
    };
    display.onresize = fit;
    display.statisticWindow = 1000;
    display.onstatistics = (s) => setStats({ lag: Math.round(s.processingLag), fps: Math.round(s.clientFps || s.desktopFps || 0), drop: s.dropRate });

    // Inbound clipboard (session → this computer).
    client.onclipboard = (stream, mimetype) => {
      if (!/^text\//.test(mimetype)) return;
      const reader = new Guacamole.StringReader(stream);
      let text = '';
      reader.ontext = (chunk) => { text += chunk; };
      reader.onend = () => { navigator.clipboard?.writeText(text).catch(() => {}); };
    };

    const rect = stage.getBoundingClientRect();
    const w = Math.max(640, Math.round(rect.width * DPR));
    const h = Math.max(480, Math.round(rect.height * DPR));
    client.connect(`token=${encodeURIComponent(token)}&GUAC_WIDTH=${w}&GUAC_HEIGHT=${h}&GUAC_DPI=${Math.round(96 * DPR)}`);

    // ── Input ──────────────────────────────────────────────────────────────
    const cleanups = [];
    let keyboard;
    if (!readOnly) {
      // Mouse state always carries the display scale (point 1).
      const sendMouse = (state) => client.sendMouseState(state, true);
      const mouse = new Guacamole.Mouse(element);
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = sendMouse;
      cleanups.push(() => { mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = null; });
      if ('ontouchstart' in window) {
        const touch = new Guacamole.Mouse.Touchscreen(element);
        touch.onmousedown = touch.onmouseup = touch.onmousemove = sendMouse;
        cleanups.push(() => { touch.onmousedown = touch.onmouseup = touch.onmousemove = null; });
      }

      // Physical keyboard.
      keyboard = new Guacamole.Keyboard(document);
      keyboard.onkeydown = (k) => client.sendKeyEvent(1, k);
      keyboard.onkeyup = (k) => client.sendKeyEvent(0, k);

      // Release stuck modifiers when focus leaves the tab/window (point 2).
      const release = () => keyboard.reset();
      const onHidden = () => { if (document.hidden) release(); };
      window.addEventListener('blur', release);
      document.addEventListener('visibilitychange', onHidden);
      cleanups.push(() => { window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', onHidden); });

      // On-screen keyboard / IME / dictation via a hidden field (point 3).
      const input = inputRef.current;
      if (input) {
        const onBeforeInput = (e) => {
          if (e.inputType === 'insertText' && e.data) {
            for (const ch of e.data) { const k = keysymOf(ch.codePointAt(0)); client.sendKeyEvent(1, k); client.sendKeyEvent(0, k); }
          } else if (e.inputType === 'deleteContentBackward') { client.sendKeyEvent(1, BACKSPACE); client.sendKeyEvent(0, BACKSPACE); }
          else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') { client.sendKeyEvent(1, ENTER); client.sendKeyEvent(0, ENTER); }
          e.preventDefault();
          input.value = '';
        };
        input.addEventListener('beforeinput', onBeforeInput);
        cleanups.push(() => input.removeEventListener('beforeinput', onBeforeInput));
      }
    }

    // Resize: scale now (cheap), reconfigure RDP debounced (point 5).
    const applySize = debounce(() => { const r = stage.getBoundingClientRect(); client.sendSize(Math.round(r.width * DPR), Math.round(r.height * DPR)); fit(); }, 300);
    const onResize = () => { fit(); applySize(); };
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(() => { fit(); applySize(); });
    observer.observe(stage);

    return () => {
      clearTimeout(timer);
      applySize.cancel();
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      cleanups.forEach((fn) => fn());
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

  // Toolbar buttons must not keep focus (point 8).
  const blur = (e) => e?.currentTarget?.blur?.();

  const toggleFullscreen = (e) => {
    blur(e);
    const root = stageRef.current?.closest('.rm-viewer-overlay');
    if (!document.fullscreenElement) root?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const sendCtrlAltDel = (e) => {
    blur(e);
    const client = clientRef.current;
    if (!client || readOnly) return;
    const keys = [0xffe3, 0xffe9, 0xffff];
    keys.forEach((k) => client.sendKeyEvent(1, k));
    [...keys].reverse().forEach((k) => client.sendKeyEvent(0, k));
  };

  // Paste the local clipboard into the session (point 4).
  const paste = async (e) => {
    blur(e);
    const client = clientRef.current;
    if (!client || readOnly) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const stream = client.createClipboardStream('text/plain');
      const writer = new Guacamole.StringWriter(stream);
      writer.sendText(text);
      writer.sendEnd();
      message.success(t('remote.viewer.pasted'));
    } catch {
      message.error(t('remote.viewer.pasteFailed'));
    }
  };

  const showKeyboard = (e) => { blur(e); inputRef.current?.focus(); };

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
            <>
              {COARSE && (
                <Tooltip title={t('remote.viewer.keyboard')}>
                  <Button size="small" ghost icon={<ControlOutlined />} onClick={showKeyboard} aria-label={t('remote.viewer.keyboard')} />
                </Tooltip>
              )}
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

      <div className="rm-viewer-stage" ref={stageRef}>
        {/* Hidden field that brings up the mobile keyboard / IME. */}
        <textarea ref={inputRef} className="rm-viewer-input" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck="false" aria-hidden="true" tabIndex={-1} />
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
