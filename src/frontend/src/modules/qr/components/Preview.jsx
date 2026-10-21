import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Dropdown, Tooltip } from 'antd';
import { CheckCircleFilled, CopyOutlined, DownloadOutlined, ExclamationCircleFilled, LoadingOutlined, QuestionCircleFilled, WarningFilled } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { copyPng, downloadBlob, fileName, pngBlob, scanCheck } from '../engine/runtime';
import QrCode from './QrCode';

const SIZES = [512, 1024, 2048, 4096];

/** Scan check after the design settles: 'idle' | 'checking' | 'ok' | 'fail' | 'unknown'. */
function useScan(result, payload) {
  const [state, setState] = useState('idle');
  useEffect(() => {
    if (!result || result.error || !payload) {
      setState('idle');
      return undefined;
    }
    let alive = true;
    setState('checking');
    const timer = setTimeout(async () => {
      const verdict = await scanCheck(result.svg, result.width, result.height, payload);
      if (alive) setState(verdict);
    }, 450);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [result, payload]);
  return state;
}

/** Export menu for a drawn result (also used by the library cards). */
export function useExport(name) {
  const { t } = useLocale();
  const { message } = App.useApp();
  return useCallback(
    async (result, format, px = 1024) => {
      if (!result || result.error) return;
      try {
        if (format === 'svg') downloadBlob(new Blob([result.svg], { type: 'image/svg+xml' }), fileName(name, 'svg'));
        else if (format === 'copy') {
          await copyPng(result.svg, result.width, result.height);
          message.success(t('qr.export.copied'));
        } else downloadBlob(await pngBlob(result.svg, result.width, result.height, px), fileName(px === 1024 ? name : `${name || 'qr-code'}-${px}`, 'png'));
      } catch {
        message.error(t('qr.export.failed'));
      }
    },
    [name, message, t]
  );
}

export function ExportButtons({ result, name, compact = false }) {
  const { t } = useLocale();
  const run = useExport(name);
  const disabled = !result || Boolean(result.error);
  const canCopy = typeof window !== 'undefined' && 'ClipboardItem' in window && Boolean(navigator.clipboard?.write);
  return (
    <div className={`qr-export${compact ? ' is-compact' : ''}`}>
      <Dropdown.Button
        type="primary"
        size={compact ? 'middle' : 'large'}
        disabled={disabled}
        icon={<DownloadOutlined />}
        onClick={() => run(result, 'png', 1024)}
        menu={{
          items: [
            ...SIZES.map((px) => ({ key: `png-${px}`, label: t('qr.export.pngSize', { px }) })),
            { type: 'divider' },
            { key: 'svg', label: t('qr.export.svg') },
          ],
          onClick: ({ key }) => (key === 'svg' ? run(result, 'svg') : run(result, 'png', Number(key.slice(4)))),
        }}
      >
        <DownloadOutlined /> PNG
      </Dropdown.Button>
      <Button size={compact ? 'middle' : 'large'} disabled={disabled} onClick={() => run(result, 'svg')}>
        SVG
      </Button>
      {canCopy && (
        <Tooltip title={t('qr.export.copy')}>
          <Button size={compact ? 'middle' : 'large'} disabled={disabled} icon={<CopyOutlined />} aria-label={t('qr.export.copy')} onClick={() => run(result, 'copy')} />
        </Tooltip>
      )}
    </div>
  );
}

const STATUS = {
  checking: { icon: <LoadingOutlined />, tone: 'muted' },
  ok: { icon: <CheckCircleFilled />, tone: 'ok' },
  fail: { icon: <ExclamationCircleFilled />, tone: 'bad' },
  unknown: { icon: <QuestionCircleFilled />, tone: 'muted' },
};

/**
 * The sticky preview: the code on a stage (a checkerboard shows through a
 * transparent background), the scan check, design warnings, size facts and
 * the downloads.
 */
export default function Preview({ payload, design, name, footer, onResult }) {
  const { t } = useLocale();
  const [result, setResult] = useState(null);
  const latest = useRef(onResult);
  latest.current = onResult;
  const handle = useCallback((value) => {
    setResult(value);
    latest.current?.(value);
  }, []);
  const scan = useScan(result, payload);
  const status = STATUS[scan];
  const warnings = result?.warnings || [];

  return (
    <aside className="qr-preview" data-tour="qr.preview">
      <div className={`qr-stage${design.background.transparent ? ' is-transparent' : ''}`}>
        <QrCode payload={payload} design={design} onResult={handle} className="qr-stage__code" />
        {!payload && <div className="qr-stage__empty">{t('qr.preview.empty')}</div>}
      </div>

      <div className="qr-status" aria-live="polite">
        {status ? (
          <span className={`qr-status__badge is-${status.tone}`}>
            {status.icon} {t(`qr.scan.${scan}`)}
          </span>
        ) : (
          <span className="qr-status__badge is-muted">{t('qr.scan.idle')}</span>
        )}
        {result && !result.error && payload && (
          <span className="qr-status__facts">
            {t('qr.preview.facts', { version: result.version, ecl: result.ecl, chars: payload.length })}
          </span>
        )}
      </div>
      {scan === 'fail' && <p className="qr-warning is-bad">{t('qr.scan.failHint')}</p>}
      {warnings.map((warning) => (
        <p key={warning} className="qr-warning">
          <WarningFilled /> {t(`qr.warnings.${warning}`)}
        </p>
      ))}

      <ExportButtons result={payload ? result : null} name={name} />
      {footer}
    </aside>
  );
}
