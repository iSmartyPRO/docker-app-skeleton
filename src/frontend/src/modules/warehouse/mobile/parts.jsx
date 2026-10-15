import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Input } from 'antd';
import { ArrowLeftOutlined, CameraOutlined, CheckOutlined, DownOutlined, MinusOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import BarcodeScanner, { useScannerInput } from '../../../components/ui/BarcodeScanner';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { formatQty, readStore, scanFeedback, whError, writeStore } from '../lib';
import { createBurstDetector, isScanCharKey } from '../../../lib/scanBurst';

const WH_KEY = 'wh.m.warehouse';

/**
 * The storekeeper's warehouse, remembered on this device. Defaults to the
 * warehouse the person is the MOL of, else the first one they operate.
 */
export function useMobileWarehouse() {
  const { meta, warehouses } = useWh();
  const list = useMemo(() => warehouses.filter((w) => !w.archived), [warehouses]);
  const [id, setId] = useState(() => readStore(WH_KEY, null));
  const fallback = useMemo(() => {
    const mol = list.find((w) => (meta?.rights?.mol || []).includes(w.id));
    return (mol || list.find((w) => (w.rights || []).includes('operate')) || list[0])?.id || null;
  }, [list, meta]);
  const current = list.find((w) => w.id === id) || list.find((w) => w.id === fallback) || null;
  const choose = useCallback((next) => {
    setId(next);
    writeStore(WH_KEY, next);
  }, []);
  return [current, choose, list];
}

/** The top bar of a mobile screen: back, title, an optional right side. */
export function MobileTop({ title, sub, back = '/app/warehouse/m', onBack, right }) {
  const navigate = useNavigate();
  const { t } = useLocale();
  return (
    <header className="whm-top">
      <button type="button" className="whm-top__back" onClick={() => (onBack ? onBack() : navigate(back))} aria-label={t('whm.back')}>
        <ArrowLeftOutlined />
      </button>
      <div className="whm-top__title">
        <h1>{title}</h1>
        {sub && <span>{sub}</span>}
      </div>
      {right && <div className="whm-top__right">{right}</div>}
    </header>
  );
}

/** A bottom sheet (phones) / centred card (desktop) above everything, the camera scanner included. */
export function Sheet({ open, onClose, title, children, footer, className = '' }) {
  const { t } = useLocale();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="whm-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="whm-sheet__backdrop" onClick={onClose} aria-label={t('whm.close')} />
      <div className={`whm-sheet__panel ${className}`}>
        <span className="whm-sheet__grip" aria-hidden="true" />
        {title && <h2 className="whm-sheet__title">{title}</h2>}
        <div className="whm-sheet__body">{children}</div>
        {footer && <div className="whm-sheet__footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Warehouse chip in the top bar; a tap opens the list. */
export function WarehouseChip({ warehouse, list, onChange, filter }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const options = filter ? list.filter(filter) : list;
  return (
    <>
      <button type="button" className="whm-whchip" onClick={() => setOpen(true)} aria-label={t('whm.home.pickWarehouse')}>
        <MenuIcon name="building" variant="mono" />
        <span>{warehouse?.name || t('whm.home.pickWarehouse')}</span>
        <DownOutlined />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('whm.home.pickWarehouse')}>
        <div className="whm-list">
          {options.map((w) => (
            <button key={w.id} type="button" className={`whm-row${w.id === warehouse?.id ? ' is-active' : ''}`} onClick={() => { onChange(w.id); setOpen(false); }}>
              <span className="whm-row__main">
                <strong>{w.name}</strong>
                <em>{[t(`wh.kinds.${w.kind}`), w.code].filter(Boolean).join(' · ')}</em>
              </span>
              {w.id === warehouse?.id && <CheckOutlined />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Step dots «Откуда / Куда · Позиции · Провести». */
export function StepDots({ step, labels }) {
  return (
    <ol className="whm-steps" aria-label={labels.join(' → ')}>
      {labels.map((label, index) => (
        <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
          <span>{index < step ? <CheckOutlined /> : index + 1}</span>
          <em>{label}</em>
        </li>
      ))}
    </ol>
  );
}

/** The sticky bottom bar with the main action (reachable with the thumb). */
export function BottomBar({ children }) {
  return <div className="whm-bottom">{children}</div>;
}

/**
 * Scanning input of a mobile screen: the camera (continuous), keyboard-wedge
 * scanners anywhere on the page, and typing a code or a name.
 * onCode(code, { source }) is called for every scan; onSearch(item) for a picked item.
 */
export function ScanBar({ onCode, onPickItem, enabled = true, title, hint, placeholder, autoOpen = false, cameraOpen, setCameraOpen }) {
  const { t } = useLocale();
  const [ownOpen, setOwnOpen] = useState(autoOpen);
  const open = cameraOpen ?? ownOpen;
  const setOpen = setCameraOpen ?? setOwnOpen;
  const [text, setText] = useState('');
  const [found, setFound] = useState([]);
  const timer = useRef(null);
  useScannerInput((code) => onCode(code, { source: 'keyboard' }), { enabled: enabled && !open });
  const search = (value) => {
    setText(value);
    clearTimeout(timer.current);
    if (!onPickItem || value.trim().length < 2) {
      setFound([]);
      return;
    }
    timer.current = setTimeout(() => {
      whApi
        .items({ q: value.trim(), pageSize: 8 })
        .then((res) => setFound(res.data.items))
        .catch(() => setFound([]));
    }, 250);
  };
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    setFound([]);
    onCode(value, { source: 'manual' });
  };
  return (
    <div className="whm-scanbar">
      <button type="button" className="whm-scanbar__camera" onClick={() => setOpen(true)} disabled={!enabled}>
        <CameraOutlined />
        <span>{t('whm.scan.camera')}</span>
      </button>
      <div className="whm-scanbar__field">
        <Input
          size="large"
          value={text}
          onChange={(e) => search(e.target.value)}
          onPressEnter={submit}
          placeholder={placeholder || t('whm.scan.placeholder')}
          prefix={<SearchOutlined />}
          allowClear
          enterKeyHint="go"
          data-scan-target=""
          aria-label={placeholder || t('whm.scan.placeholder')}
        />
        {found.length > 0 && (
          <div className="whm-suggest" role="listbox">
            {found.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  setText('');
                  setFound([]);
                  onPickItem(item);
                }}
              >
                <strong>{item.name}</strong>
                <em>{[item.sku, `${formatQty(item.stock)} ${item.baseUnit}`].filter(Boolean).join(' · ')}</em>
              </button>
            ))}
          </div>
        )}
      </div>
      <BarcodeScanner open={open} continuous onScan={(code) => onCode(code, { source: 'camera' })} onClose={() => setOpen(false)} title={title} hint={hint} />
    </div>
  );
}

/** Resolves a scanned code with feedback; returns the server answer or null. */
export function useResolver(warehouseId) {
  const { t } = useLocale();
  const { message } = App.useApp();
  return useCallback(
    async (code) => {
      try {
        const res = await whApi.resolve(code, warehouseId);
        return res.data;
      } catch (err) {
        scanFeedback(false);
        message.error({ content: whError(err, t), key: 'whm-scan' });
        return null;
      }
    },
    [warehouseId, message, t]
  );
}

/**
 * A keyboard-wedge scanner aimed at a focused quantity field types the code
 * into it and presses Enter. This guard (onKeyDown of the field) sees such a
 * burst: Enter is swallowed, the field gets back the value it had before the
 * burst (`restore(value)`), and the code goes to `onCode(code, value)`. People
 * typing a quantity are far slower than a scanner and are not affected.
 */
export function useQtyScanGuard({ value, restore, onCode }) {
  const detector = useRef(null);
  if (!detector.current) detector.current = createBurstDetector();
  const before = useRef(value);
  const latest = useRef({ value, restore, onCode });
  latest.current = { value, restore, onCode };
  return useCallback((event) => {
    const prior = latest.current.value;
    const code = detector.current.push({ key: event.key, time: event.timeStamp || performance.now(), ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey });
    if (isScanCharKey(event) && detector.current.length === 1) before.current = prior;
    if (!code) return;
    event.preventDefault();
    event.stopPropagation();
    latest.current.restore?.(before.current);
    latest.current.onCode?.(code, before.current);
  }, []);
}

/** Units of an item for the switch: base first, then packs (factor = base units in one). */
export function unitList(item) {
  if (!item) return [];
  return [{ code: item.baseUnit, factor: 1 }, ...(item.units || []).map((u) => ({ code: u.code, factor: Number(u.factor) }))];
}

/**
 * The quantity sheet after a scan (spec §2): big − / + buttons, the unit switch
 * pack ↔ base with «2 уп. = 48 шт», the stock hint, a repeat scan adds one.
 */
export function QtySheet({ open, item, qty, unit, onChange, onSubmit, onClose, onRemove, onScanCode, title, hint, submitLabel, extra, allowZero = false, busy = false }) {
  const { t, locale } = useLocale();
  const units = unitList(item);
  const current = units.find((u) => u.code === unit) || units[0];
  const guard = useQtyScanGuard({ value: qty, restore: (value) => onChange({ qty: value, unit: current?.code }), onCode: (code, value) => onScanCode?.(code, { qty: value }) });
  const serial = item?.tracking === 'serial';
  const n = Number(qty) || 0;
  const step = (delta) => onChange({ qty: Math.max(0, Math.round((n + delta) * 1e4) / 1e4), unit: current?.code });
  const ok = allowZero ? n >= 0 : n > 0;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Enter' && ok && !busy && document.activeElement?.tagName !== 'BUTTON') {
        event.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ok, busy, onSubmit]);
  if (!item) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      className="whm-qty"
      footer={
        <div className="whm-qty__actions">
          {onRemove && <Button size="large" danger onClick={onRemove}>{t('whm.qty.remove')}</Button>}
          <Button type="primary" size="large" block disabled={!ok} loading={busy} onClick={onSubmit} icon={<CheckOutlined />}>
            {submitLabel || t('whm.qty.add')}
          </Button>
        </div>
      }
    >
      <div className="whm-qty__item">
        {title && <span className="whm-qty__eyebrow">{title}</span>}
        <strong>{item.name}</strong>
        <em>{[item.sku, extra].filter(Boolean).join(' · ')}</em>
        {hint}
      </div>
      <div className="whm-qty__stepper">
        <button type="button" className="whm-qty__btn" onClick={() => step(-1)} disabled={n <= 0} aria-label={t('whm.qty.less')}>
          <MinusOutlined />
        </button>
        <input
          className="whm-qty__value"
          type="text"
          inputMode="decimal"
          value={String(qty ?? '')}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
            onChange({ qty: raw === '' ? '' : raw, unit: current?.code });
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={guard}
          aria-label={t('whm.qty.quantity')}
        />
        <button type="button" className="whm-qty__btn is-plus" onClick={() => step(1)} aria-label={t('whm.qty.more')}>
          <PlusOutlined />
        </button>
      </div>
      {!serial && units.length > 1 && (
        <div className="whm-units" role="radiogroup" aria-label={t('whm.qty.unit')}>
          {units.map((u) => (
            <button key={u.code} type="button" role="radio" aria-checked={u.code === current.code} className={u.code === current.code ? 'is-active' : ''} onClick={() => onChange({ qty, unit: u.code })}>
              {u.code}
              {u.factor !== 1 && <em>= {formatQty(u.factor, locale)} {item.baseUnit}</em>}
            </button>
          ))}
        </div>
      )}
      {!serial && current && current.factor !== 1 && n > 0 && (
        <p className="whm-conv">
          {formatQty(n, locale)} {current.code} = <strong>{formatQty(Math.round(n * current.factor * 1e4) / 1e4, locale)} {item.baseUnit}</strong>
        </p>
      )}
      <div className="whm-quick">
        {[5, 10, 50].map((d) => (
          <button key={d} type="button" onClick={() => step(d)}>+{d}</button>
        ))}
      </div>
    </Sheet>
  );
}

/** The clear success screen after posting (spec: «Провести» with a clear result). */
export function SuccessScreen({ tone = 'green', icon = '✓', title, text, children }) {
  return (
    <div className={`whm-success is-${tone}`} role="status">
      <span className="whm-success__badge" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      <div className="whm-success__actions">{children}</div>
    </div>
  );
}

/** «на складе 120 · доступно 100» in one line for mobile rows. */
export function HintLine({ hint, unit, short }) {
  const { t, locale } = useLocale();
  if (!hint) return null;
  return (
    <span className={`whm-hint${short ? ' is-short' : ''}`}>
      {t('wh.hint.onHand')} {formatQty(hint.qty, locale)}
      {hint.reserved > 0 && ` · ${t('wh.hint.reserved')} ${formatQty(hint.reserved, locale)}`}
      {' · '}
      <strong>{t('wh.hint.available')} {formatQty(hint.available, locale)}</strong>
      {unit ? ` ${unit}` : ''}
    </span>
  );
}

/** Photo from the phone camera straight into the document (waybill, damage). */
export function PhotoButton({ docId, kind = 'waybill', files = [], onUploaded, label }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (event) => {
    const list = [...(event.target.files || [])];
    event.target.value = '';
    if (!list.length) return;
    setBusy(true);
    try {
      const res = await whApi.upload('documents', docId, list, kind);
      onUploaded?.(res.data.files);
      message.success(t('wh.files.uploaded'));
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const shown = files.filter((f) => f.kind === kind);
  return (
    <div className="whm-photo">
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={pick} data-testid={`photo-${kind}`} />
      <button type="button" className="whm-photo__btn" onClick={() => input.current?.click()} disabled={busy}>
        <CameraOutlined />
        <span>{busy ? t('wh.files.uploading') : label || t('whm.flow.photoWaybill')}</span>
        {shown.length > 0 && <em>{t('whm.flow.photos', { n: shown.length })}</em>}
      </button>
      {shown.length > 0 && (
        <div className="whm-photo__thumbs">
          {shown.map((file) => (
            <a key={file.id} href={`/api${file.url.replace(/^\/api/, '')}`} target="_blank" rel="noreferrer">
              {/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? <img src={`/api${file.url.replace(/^\/api/, '')}`} alt={file.name} /> : <span>📎</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
