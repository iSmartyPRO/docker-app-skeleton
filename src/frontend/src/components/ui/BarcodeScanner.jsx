import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Spin, Tooltip } from 'antd';
import {
  CameraOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  LockOutlined,
  ReloadOutlined,
  ScanOutlined,
  SwapOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { createBurstDetector, createRepeatGuard, isScanCharKey } from '../../lib/scanBurst';
import { DEFAULT_SCAN_FORMATS, createBarcodeDecoder } from '../../lib/barcodeDecoder';
import './scan.css';

/*
 * Camera barcode scanner + keyboard-wedge scanner support.
 *
 *   <BarcodeScanner open onScan={(code, { format }) => …} onClose={…} continuous />
 *   useScannerInput((code) => …, { enabled, minLength, maxInterval })
 *   <ScanButton onScan={(code) => form.setFieldValue('sku', code)} />
 *
 * Decoding: the native BarcodeDetector where it exists, else WebAssembly ZXing
 * loaded on first use (separate chunk + .wasm, never in the main bundle).
 */

const REPEAT_MS = 1200;
const SINGLE_CLOSE_MS = 420;

// ── Keyboard-wedge scanners ──────────────────────────────────────────────────

/*
 * One window listener for every useScannerInput; only the most recently enabled
 * hook receives scans (an open scanner dialog takes them from the page below).
 */
const wedgeStack = [];
let wedgeListener = null;

function isEditable(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(el.type);
}

/** Empties a (possibly React-controlled) input after a scan landed in it. */
function clearInput(el) {
  if (!el || !('value' in el) || el.getAttribute('data-scan-target') === 'keep') return;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, '');
  else el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function onWedgeKey(event) {
  const top = wedgeStack[wedgeStack.length - 1];
  if (!top || event.isComposing) return;
  const target = event.target;
  const scanTarget = target?.closest?.('[data-scan-target]') || null;
  if (!scanTarget && isEditable(target)) {
    // People type in ordinary fields: a scanner aimed at them just types there.
    top.detector.reset();
    return;
  }
  const code = top.detector.push({
    key: event.key,
    time: event.timeStamp || performance.now(),
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
  });
  if (!code) return;
  event.preventDefault();
  event.stopPropagation();
  if (scanTarget && isEditable(target)) clearInput(target);
  top.onScan.current?.(code, { format: 'keyboard', source: 'keyboard', target: scanTarget });
}

/**
 * Hardware scanners that act as a keyboard (USB / Bluetooth "HID" mode): a burst
 * of keystrokes at most `maxInterval` ms apart, at least `minLength` long, ended
 * by Enter → `onScan(code)`. Ignored while the person types in an ordinary
 * input; works inside an element marked `data-scan-target` (its text is cleared
 * after the scan unless `data-scan-target="keep"`).
 */
export function useScannerInput(onScan, { enabled = true, minLength = 4, maxInterval = 35 } = {}) {
  const callback = useRef(onScan);
  callback.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    const entry = { onScan: callback, detector: createBurstDetector({ minLength, maxInterval }) };
    wedgeStack.push(entry);
    if (!wedgeListener) {
      wedgeListener = onWedgeKey;
      window.addEventListener('keydown', wedgeListener, true);
    }
    return () => {
      const at = wedgeStack.indexOf(entry);
      if (at >= 0) wedgeStack.splice(at, 1);
      if (!wedgeStack.length && wedgeListener) {
        window.removeEventListener('keydown', wedgeListener, true);
        wedgeListener = null;
      }
    };
  }, [enabled, minLength, maxInterval]);
}

// ── Feedback ──────────────────────────────────────────────────────────────────

function beep(audioRef) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioRef.current) audioRef.current = new AudioCtx();
    const ctx = audioRef.current;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  } catch {
    /* no audio: vibration and the flash still confirm */
  }
}

function vibrate() {
  try {
    navigator.vibrate?.(55);
  } catch {
    /* ignore */
  }
}

function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return undefined;
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function cameraErrorStatus(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'nocamera';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'error';
  }
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(navigator.userAgent);

// ── Scanner dialog ───────────────────────────────────────────────────────────

/**
 * Camera scanner: full screen on phones, a dialog on larger screens.
 *
 * @param {boolean}  open
 * @param {(code: string, meta: { format: string }) => void} onScan
 *        format: 'ean_13' | 'code_128' | 'qr_code' | … | 'manual' | 'keyboard'
 * @param {() => void} onClose
 * @param {boolean}  [continuous=false] keep scanning (same code ignored for 1.2 s); otherwise closes after the first code
 * @param {string}   [title]
 * @param {string}   [hint]
 * @param {string[]} [formats] BarcodeDetector format names (default: EAN-13/8, UPC, Code 128/39, QR, DataMatrix)
 */
export default function BarcodeScanner({ open, onScan, onClose, continuous = false, title, hint, formats = DEFAULT_SCAN_FORMATS }) {
  const { t } = useLocale();
  const full = useMediaQuery('(max-width: 640px), (max-height: 520px)');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const decoderRef = useRef(null);
  const audioRef = useRef(null);
  const guardRef = useRef(createRepeatGuard(REPEAT_MS));
  const pausedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  const [status, setStatus] = useState('starting');
  const [decoderState, setDecoderState] = useState('loading'); // loading | ready | failed
  const [cameras, setCameras] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [attempt, setAttempt] = useState(0);
  const [count, setCount] = useState(0);
  const [lastCode, setLastCode] = useState(null);
  const [flash, setFlash] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const formatsKey = formats.join(',');

  // Fresh state for every opening.
  useEffect(() => {
    if (!open) return;
    guardRef.current.reset();
    pausedRef.current = false;
    setCount(0);
    setLastCode(null);
    setManualOpen(false);
    setManualValue('');
  }, [open]);

  const accept = useCallback(
    (code, format) => {
      const value = String(code ?? '').trim();
      if (!value || pausedRef.current) return;
      if (!guardRef.current.accept(value, performance.now()) && format !== 'manual') return;
      vibrate();
      beep(audioRef);
      setFlash((n) => n + 1);
      setCount((n) => n + 1);
      setLastCode(value);
      if (!continuous) pausedRef.current = true;
      onScanRef.current?.(value, { format });
      if (!continuous) setTimeout(() => onCloseRef.current?.(), SINGLE_CLOSE_MS);
    },
    [continuous]
  );

  // A hardware scanner keeps working while the dialog is open.
  useScannerInput((code) => accept(code, 'keyboard'), { enabled: Boolean(open) });

  // Pause the camera while the tab is hidden (phones lock, app switch).
  useEffect(() => {
    if (!open) return undefined;
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [open]);

  // Decoder: native or lazily loaded WASM.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setDecoderState('loading');
    createBarcodeDecoder(formatsKey.split(','))
      .then((decoder) => {
        if (cancelled) {
          decoder.dispose?.();
          return;
        }
        decoderRef.current = decoder;
        setDecoderState('ready');
      })
      .catch(() => !cancelled && setDecoderState('failed'));
    return () => {
      cancelled = true;
      decoderRef.current?.dispose?.();
      decoderRef.current = null;
    };
  }, [open, formatsKey, attempt]);

  // Camera.
  useEffect(() => {
    if (!open || !visible) return undefined;
    let cancelled = false;

    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setStatus('insecure');
      return undefined;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return undefined;
    }

    setStatus('starting');
    setTorch({ supported: false, on: false });
    const video = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };

    navigator.mediaDevices
      .getUserMedia({ video, audio: false })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() || {};
        if (caps.focusMode?.includes?.('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        setTorch({ supported: Boolean(caps.torch), on: false });
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play().catch(() => {});
        }
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setCameras(devices.filter((d) => d.kind === 'videoinput'));
        } catch {
          /* switching is optional */
        }
        if (!cancelled) setStatus('live');
      })
      .catch((err) => {
        if (!cancelled) setStatus(cameraErrorStatus(err));
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, visible, deviceId, attempt]);

  // Decode loop: one frame at a time, throttled.
  useEffect(() => {
    if (!open || status !== 'live' || decoderState !== 'ready') return undefined;
    let raf = 0;
    let busy = false;
    let lastRun = 0;
    let stopped = false;
    const interval = decoderRef.current?.kind === 'native' ? 90 : 140;

    const tick = (now) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const el = videoRef.current;
      const decoder = decoderRef.current;
      if (busy || !decoder || !el || el.readyState < 2 || pausedRef.current || now - lastRun < interval) return;
      busy = true;
      lastRun = now;
      decoder
        .detect(el)
        .then((found) => {
          if (!stopped && found.length) accept(found[0].text, found[0].format);
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [open, status, decoderState, accept]);

  // Release the audio context when the dialog goes away.
  useEffect(() => {
    if (open) return undefined;
    const ctx = audioRef.current;
    audioRef.current = null;
    ctx?.close?.().catch(() => {});
    return undefined;
  }, [open]);
  useEffect(
    () => () => {
      audioRef.current?.close?.().catch(() => {});
      audioRef.current = null;
    },
    []
  );

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const current = streamRef.current?.getVideoTracks()[0]?.getSettings?.().deviceId || deviceId;
    const at = cameras.findIndex((c) => c.deviceId === current);
    setDeviceId(cameras[(at + 1) % cameras.length].deviceId);
  };

  const toggleTorch = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    track
      .applyConstraints({ advanced: [{ torch: next }] })
      .then(() => setTorch((s) => ({ ...s, on: next })))
      .catch(() => setTorch({ supported: false, on: false }));
  };

  const submitManual = () => {
    const value = manualValue.trim();
    if (!value) return;
    setManualValue('');
    accept(value, 'manual');
  };

  const retry = () => setAttempt((n) => n + 1);
  const problem = ['insecure', 'unsupported', 'denied', 'nocamera', 'busy', 'error'].includes(status) ? status : decoderState === 'failed' ? 'decoder' : null;
  const showManual = manualOpen || Boolean(problem);
  const heading = title || t('scanner.title');

  const problemView = problem && (
    <div className="scanner__problem" role="alert">
      <span className="scanner__problem-icon" aria-hidden="true">
        {problem === 'insecure' || problem === 'denied' ? <LockOutlined /> : problem === 'nocamera' ? <CameraOutlined /> : <WarningOutlined />}
      </span>
      <div className="scanner__problem-title">
        {t(
          {
            insecure: 'scanner.insecureTitle',
            unsupported: 'scanner.unsupportedTitle',
            denied: 'scanner.deniedTitle',
            nocamera: 'scanner.noCameraTitle',
            busy: 'scanner.busyTitle',
            error: 'scanner.errorTitle',
            decoder: 'scanner.errorTitle',
          }[problem]
        )}
      </div>
      <div className="scanner__problem-text">
        {t(
          {
            insecure: 'scanner.insecureText',
            unsupported: 'scanner.unsupportedText',
            denied: 'scanner.deniedText',
            nocamera: 'scanner.noCameraText',
            busy: 'scanner.busyText',
            error: 'scanner.errorText',
            decoder: 'scanner.decoderFailed',
          }[problem]
        )}
      </div>
      {problem === 'denied' && (
        <ul className="scanner__how">
          {(isIos() ? ['deniedIos'] : isAndroid() ? ['deniedAndroid'] : ['deniedDesktop', 'deniedAndroid', 'deniedIos']).map((key) => (
            <li key={key}>{t(`scanner.${key}`)}</li>
          ))}
        </ul>
      )}
      {!['insecure', 'unsupported'].includes(problem) && (
        <Button className="scanner__retry" icon={<ReloadOutlined />} onClick={retry}>
          {t('scanner.retry')}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      centered={!full}
      transitionName={full ? 'ant-fade' : undefined}
      width={full ? '100%' : 480}
      destroyOnHidden
      rootClassName={`scanner-root${full ? ' scanner-root--full' : ''}`}
      styles={{ content: { padding: 0, overflow: 'hidden' }, body: { padding: 0 } }}
      aria-label={heading}
    >
      <div className={`scanner${full ? ' scanner--full' : ''}`}>
        <div className={`scanner__stage${status === 'live' ? ' is-live' : ''}`}>
          <video ref={videoRef} className="scanner__video" playsInline muted autoPlay aria-hidden="true" />

          {!problem && (
            <div className="scanner__viewport" aria-hidden="true">
              <div className={`scanner__frame${flash ? ' is-hit' : ''}`} key={flash}>
                <span className="scanner__corner scanner__corner--tl" />
                <span className="scanner__corner scanner__corner--tr" />
                <span className="scanner__corner scanner__corner--bl" />
                <span className="scanner__corner scanner__corner--br" />
                {status === 'live' && decoderState === 'ready' && <span className="scanner__laser" />}
              </div>
            </div>
          )}

          {flash > 0 && <div className="scanner__flash" key={`f${flash}`} aria-hidden="true" />}

          <div className="scanner__bar">
            <div className="scanner__heading">
              <ScanOutlined aria-hidden="true" />
              <span>{heading}</span>
            </div>
            <Tooltip title={t('scanner.close')}>
              <button type="button" className="scanner__glass" onClick={onClose} aria-label={t('scanner.close')}>
                <CloseOutlined />
              </button>
            </Tooltip>
          </div>

          {!problem && (status === 'starting' || decoderState === 'loading') && (
            <div className="scanner__wait">
              <Spin size="small" />
              <span>{status === 'starting' ? t('scanner.starting') : t('scanner.loadingDecoder')}</span>
            </div>
          )}

          {problemView}

          {!problem && (
            <div className="scanner__tools">
              {cameras.length > 1 && (
                <Tooltip title={t('scanner.switchCamera')}>
                  <button type="button" className="scanner__glass" onClick={switchCamera} aria-label={t('scanner.switchCamera')}>
                    <SwapOutlined />
                  </button>
                </Tooltip>
              )}
              {torch.supported && (
                <Tooltip title={torch.on ? t('scanner.torchOff') : t('scanner.torchOn')}>
                  <button
                    type="button"
                    className={`scanner__glass${torch.on ? ' is-on' : ''}`}
                    onClick={toggleTorch}
                    aria-pressed={torch.on}
                    aria-label={torch.on ? t('scanner.torchOff') : t('scanner.torchOn')}
                  >
                    {torch.on ? <ThunderboltFilled /> : <ThunderboltOutlined />}
                  </button>
                </Tooltip>
              )}
              <button
                type="button"
                className={`scanner__glass scanner__glass--wide${manualOpen ? ' is-on' : ''}`}
                onClick={() => setManualOpen((v) => !v)}
                aria-expanded={manualOpen}
              >
                <EditOutlined />
                <span>{t('scanner.manual')}</span>
              </button>
            </div>
          )}
        </div>

        <div className="scanner__panel">
          {!problem && <div className="scanner__hint">{hint || t('scanner.hint')}</div>}

          {showManual && (
            <form
              className="scanner__manual"
              onSubmit={(event) => {
                event.preventDefault();
                submitManual();
              }}
            >
              <Input
                size="large"
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                placeholder={t('scanner.manualPlaceholder')}
                autoFocus={manualOpen}
                autoComplete="off"
                inputMode="text"
                enterKeyHint="done"
                data-scan-target=""
                aria-label={t('scanner.manual')}
              />
              <Button size="large" type="primary" htmlType="submit" disabled={!manualValue.trim()}>
                {t('scanner.add')}
              </Button>
            </form>
          )}

          {continuous && (
            <div className="scanner__summary">
              <div className="scanner__count" aria-live="polite">
                {t('scanner.scanned', { count })}
              </div>
              {lastCode && (
                <span className="scanner__chip" title={t('scanner.last')} key={`${lastCode}-${count}`}>
                  <CheckOutlined aria-hidden="true" />
                  <span className="scanner__chip-text">{lastCode}</span>
                </span>
              )}
              <Button type="primary" className="scanner__done" onClick={onClose}>
                {t('scanner.done')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export { BarcodeScanner };

/**
 * Small icon button that opens the scanner — for form fields.
 *
 *   <Input addonAfter={<ScanButton onScan={(code) => form.setFieldValue('barcode', code)} />} />
 *
 * Props: onScan (as BarcodeScanner), continuous, title, hint, formats, tooltip,
 * plus Button props (size, type, disabled, className…).
 */
export function ScanButton({ onScan, continuous = false, title, hint, formats, tooltip, type = 'text', ...buttonProps }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const label = tooltip ?? t('scanner.button');

  return (
    <>
      <Tooltip title={label}>
        <Button
          type={type}
          icon={<ScanOutlined />}
          aria-label={label}
          {...buttonProps}
          onClick={(event) => {
            buttonProps.onClick?.(event);
            setMounted(true);
            setOpen(true);
          }}
        />
      </Tooltip>
      {mounted && (
        <BarcodeScanner
          open={open}
          continuous={continuous}
          title={title}
          hint={hint}
          formats={formats}
          onScan={onScan}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Re-exported for callers that want the pure helper next to the hook.
export { isScanCharKey };
