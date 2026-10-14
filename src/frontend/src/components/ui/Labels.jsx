import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, InputNumber, Modal } from 'antd';
import { LeftOutlined, PrinterOutlined, RightOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import {
  DEFAULT_LABEL_FORMAT,
  LABEL_FORMAT_IDS,
  expandCopies,
  hasQrEncoder,
  labelCss,
  labelFormat,
  labelHtml,
  loadQrEncoder,
  pageCount,
  printLabels,
  resolveLabelKind,
} from '../../lib/labels';
import './labels.css';

/*
 * Label preview and print dialog.
 *
 *   <LabelPreview item={{ code: 'WH-000123', title: 'Цемент М500', kind: 'qr' }} format="58x40" />
 *   <PrintLabelsDialog open items={[…]} onClose={() => setOpen(false)} />
 *
 * The preview renders exactly the markup that is printed (lib/labels.js).
 */

const FORMAT_KEY = 'da_label_format';
const COPIES_KEY = 'da_label_copies';
const PX_PER_MM = 96 / 25.4;

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode: the choice lives for this dialog only */
  }
}

/** Loads the QR encoder when any of `items` needs it; true once labels can render. */
function useQrReady(items) {
  const needs = items.some((item) => item && resolveLabelKind(item).kind === 'qr');
  const [ready, setReady] = useState(() => !needs || hasQrEncoder());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!needs || hasQrEncoder()) {
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    setReady(false);
    loadQrEncoder()
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [needs]);
  return { ready, failed };
}

/**
 * How a label will look, to scale. Fits the container width (never wider than
 * `maxScale` × real size).
 *
 * @param {{ code: string, title: string, subtitle?: string, kind: 'qr'|'code128'|'ean13', extra?: string|string[] }} item
 * @param {'58x40'|'80x50'|'a4-3x8'} [format='58x40']
 * @param {number} [maxScale=1.6]
 */
export function LabelPreview({ item, format = DEFAULT_LABEL_FORMAT, maxScale = 1.6, className = '' }) {
  const f = labelFormat(format);
  const items = useMemo(() => [item], [item]);
  const { ready } = useQrReady(items);
  const boxRef = useRef(null);
  const [avail, setAvail] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setAvail(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const html = useMemo(() => {
    if (!item || !ready) return '';
    try {
      return labelHtml(item);
    } catch {
      return '';
    }
  }, [item, ready]);

  const w = f.width * PX_PER_MM;
  const h = f.height * PX_PER_MM;
  const scale = avail ? Math.min(maxScale, avail / w) : 1;
  const scope = `.label-preview[data-format="${f.id}"]`;

  return (
    <div ref={boxRef} className={`label-preview-box ${className}`.trim()}>
      <style>{labelCss(f.id, scope)}</style>
      <div className="label-preview" data-format={f.id} style={{ width: w * scale, height: h * scale }}>
        <div
          className="label-preview__paper"
          style={{ width: w, height: h, transform: `scale(${scale})` }}
          // Built by lib/labels.js from escaped text and generated SVG only.
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!html && <div className="label-preview__skeleton" />}
      </div>
      <div className="label-preview__size">
        {f.width} × {f.height} mm
      </div>
    </div>
  );
}

function FormatGlyph({ id }) {
  const f = labelFormat(id);
  if (f.sheet) {
    return (
      <span className="label-format__glyph label-format__glyph--sheet" aria-hidden="true">
        {Array.from({ length: 12 }, (_, k) => (
          <i key={k} />
        ))}
      </span>
    );
  }
  const ratio = f.height / f.width;
  return (
    <span className="label-format__glyph" aria-hidden="true">
      <i style={{ width: 30, height: Math.round(30 * ratio) }} />
    </span>
  );
}

/**
 * Print dialog: format (remembered on this device), copies, live preview, «Print».
 *
 * @param {boolean} open
 * @param {Array<{ code, title, subtitle?, kind: 'qr'|'code128'|'ean13', extra?, copies? }>} items
 * @param {() => void} onClose
 * @param {string} [title]          dialog title (default «Печать этикеток»)
 * @param {string} [defaultFormat]  used when nothing is remembered yet
 * @param {(info: { format, copies, count }) => void} [onPrinted]
 */
export function PrintLabelsDialog({ open, items = [], onClose, title, defaultFormat, onPrinted }) {
  const { t } = useLocale();
  const list = useMemo(() => (items || []).filter((item) => item && String(item.code ?? '').trim()), [items]);
  const [format, setFormat] = useState(() => {
    const saved = readPref(FORMAT_KEY);
    return LABEL_FORMAT_IDS.includes(saved) ? saved : LABEL_FORMAT_IDS.includes(defaultFormat) ? defaultFormat : DEFAULT_LABEL_FORMAT;
  });
  const [copies, setCopies] = useState(() => {
    const saved = Number(readPref(COPIES_KEY));
    return saved >= 1 && saved <= 99 ? Math.floor(saved) : 1;
  });
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { failed: qrFailed } = useQrReady(open ? list : []);

  useEffect(() => {
    if (open) {
      setIndex(0);
      setError(null);
    }
  }, [open]);

  const current = list[Math.min(index, list.length - 1)];
  const count = expandCopies(list, copies).length;
  const pages = pageCount(count, format);
  const sheet = labelFormat(format).sheet;

  const fallbacks = useMemo(() => {
    const ean = [];
    const qr = [];
    for (const item of list) {
      const r = resolveLabelKind(item);
      if (r.fallback === 'ean13' && r.kind === 'code128') ean.push(r.code);
      else if (r.fallback) qr.push(r.code);
    }
    return { ean, qr };
  }, [list]);

  const shortList = (codes) => (codes.length > 3 ? `${codes.slice(0, 3).join(', ')} +${codes.length - 3}` : codes.join(', '));

  const pick = (id) => {
    setFormat(id);
    writePref(FORMAT_KEY, id);
  };

  const print = async () => {
    if (!list.length) return;
    setBusy(true);
    setError(null);
    writePref(FORMAT_KEY, format);
    writePref(COPIES_KEY, copies);
    try {
      await printLabels(list, { format, copies, title: title || t('labelPrint.title') });
      onPrinted?.({ format, copies, count });
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title || t('labelPrint.title')}
      width={600}
      centered
      destroyOnHidden
      rootClassName="label-dialog-root"
      footer={
        <div className="label-dialog__footer">
          <span className="label-dialog__total">
            {t('labelPrint.total', { count })}
            {sheet ? ` · ${t('labelPrint.sheets', { count: pages })}` : ''}
          </span>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<PrinterOutlined />} loading={busy} disabled={!list.length || qrFailed} onClick={print}>
            {t('labelPrint.print')}
          </Button>
        </div>
      }
    >
      <div className="label-dialog">
        <div className="label-dialog__label">{t('labelPrint.format')}</div>
        <div className="label-format" role="radiogroup" aria-label={t('labelPrint.format')}>
          {LABEL_FORMAT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={format === id}
              className={`label-format__option${format === id ? ' is-active' : ''}`}
              onClick={() => pick(id)}
            >
              <FormatGlyph id={id} />
              <span className="label-format__name">{t(`labelPrint.formats.${id}`)}</span>
              <span className="label-format__hint">{t(`labelPrint.formatHints.${id}`)}</span>
            </button>
          ))}
        </div>

        <div className="label-dialog__row">
          <label className="label-dialog__label" htmlFor="label-copies">
            {t('labelPrint.copies')}
          </label>
          <InputNumber id="label-copies" min={1} max={99} value={copies} onChange={(v) => setCopies(Math.max(1, Math.min(99, Math.floor(v || 1))))} />
        </div>

        <div className="label-dialog__preview">
          <div className="label-dialog__preview-head">
            <span className="label-dialog__label">{t('labelPrint.preview')}</span>
            {list.length > 1 && (
              <span className="label-dialog__pager">
                <Button size="small" type="text" icon={<LeftOutlined />} aria-label={t('labelPrint.prev')} disabled={index <= 0} onClick={() => setIndex((i) => i - 1)} />
                <span>{t('labelPrint.position', { index: index + 1, total: list.length })}</span>
                <Button size="small" type="text" icon={<RightOutlined />} aria-label={t('labelPrint.next')} disabled={index >= list.length - 1} onClick={() => setIndex((i) => i + 1)} />
              </span>
            )}
          </div>
          <div className="label-dialog__stage">
            {current ? <LabelPreview item={current} format={format} maxScale={format === 'a4-3x8' ? 1.5 : 1.25} /> : <div className="label-dialog__empty">{t('labelPrint.empty')}</div>}
          </div>
        </div>

        {fallbacks.ean.length > 0 && <Alert type="warning" showIcon message={t('labelPrint.fallbackEan', { codes: shortList(fallbacks.ean) })} />}
        {fallbacks.qr.length > 0 && <Alert type="info" showIcon message={t('labelPrint.fallbackQr', { codes: shortList(fallbacks.qr) })} />}
        {(error || qrFailed) && <Alert type="error" showIcon message={t('labelPrint.failed', { error: error || 'QR' })} />}

        <div className="label-dialog__tip">{t('labelPrint.tip')}</div>
      </div>
    </Modal>
  );
}

export default PrintLabelsDialog;
