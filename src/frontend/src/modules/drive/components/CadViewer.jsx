import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Popover, Progress, Tooltip } from 'antd';
import { Color } from 'three';
import { DxfViewer } from 'dxf-viewer';
import { useLocale } from '../../../context/LocaleContext';

const FONTS = ['/fonts/cad-sans.ttf'];

function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}

/**
 * AutoCAD drawings in the browser: DXF directly, DWG converted to DXF on the
 * server. WebGL rendering with pan / zoom, layers and a light or dark sheet.
 */
export default function CadViewer({ url, name, downloadUrl }) {
  const { t } = useLocale();
  const host = useRef(null);
  const viewer = useRef(null);
  const [phase, setPhase] = useState({ name: 'fetch', progress: 0 });
  const [error, setError] = useState(null);
  const [layers, setLayers] = useState([]);
  const [hidden, setHidden] = useState(new Set());
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    let disposed = false;
    const instance = new DxfViewer(host.current, {
      clearColor: new Color(dark ? '#0f141c' : '#ffffff'),
      autoResize: true,
      colorCorrection: true,
      blackWhiteInversion: true,
      antialias: true,
    });
    viewer.current = instance;
    setError(null);
    setPhase({ name: 'fetch', progress: 0 });
    instance
      .Load({
        url,
        fonts: FONTS,
        progressCbk: (name, done, total) => !disposed && setPhase({ name, progress: total ? done / total : 0 }),
        workerFactory: () => new Worker(new URL('./cadWorker.js', import.meta.url), { type: 'module' }),
      })
      .then(() => {
        if (disposed) return;
        setLayers(instance.GetLayers().map((layer) => ({ name: layer.name, label: layer.displayName || layer.name, color: `#${layer.color.toString(16).padStart(6, '0')}` })));
        setPhase(null);
      })
      .catch((err) => {
        if (disposed) return;
        setError(err?.message || 'error');
        setPhase(null);
      });
    return () => {
      disposed = true;
      instance.Destroy();
      viewer.current = null;
    };
    // Recreated on theme change: the sheet colour is a renderer option.
  }, [url, dark]);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const toggleLayer = (layer, show) => {
    viewer.current?.ShowLayer(layer, show);
    setHidden((prev) => {
      const next = new Set(prev);
      if (show) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const fit = () => {
    const instance = viewer.current;
    const bounds = instance?.GetBounds();
    const origin = instance?.GetOrigin();
    if (!bounds || !origin) return;
    instance.FitView(bounds.minX - origin.x, bounds.maxX - origin.x, bounds.minY - origin.y, bounds.maxY - origin.y, 0.05);
  };

  return (
    <div className="cadv">
      <div className="cadv__bar">
        <span className="cadv__badge">{t('drive.cad.badge')}</span>
        <span className="cadv__hint">{t('drive.cad.hint')}</span>
        <span className="cadv__grow" />
        {layers.length > 0 && (
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div className="cadv__layers">
                {layers.map((layer) => (
                  <Checkbox key={layer.name} checked={!hidden.has(layer.name)} onChange={(event) => toggleLayer(layer.name, event.target.checked)}>
                    <span className="cadv__swatch" style={{ background: layer.color }} />
                    {layer.label}
                  </Checkbox>
                ))}
              </div>
            }
          >
            <Button size="small">{t('drive.cad.layers', { n: layers.length })}</Button>
          </Popover>
        )}
        <Tooltip title={t('drive.cad.fit')}>
          <Button size="small" onClick={fit}>⤢</Button>
        </Tooltip>
      </div>
      <div className="cadv__canvas" ref={host} aria-label={name} />
      {phase && (
        <div className="cadv__overlay">
          <div className="cadv__loading">
            <span>{t(`drive.cad.phase.${phase.name}`)}</span>
            <Progress percent={Math.round((phase.progress || 0) * 100)} size="small" showInfo={false} status="active" />
          </div>
        </div>
      )}
      {error && (
        <div className="cadv__overlay">
          <div className="viewer-empty">
            <strong>{t('drive.cad.failed')}</strong>
            <span>{t('drive.cad.failedText')}</span>
            {downloadUrl && <Button type="primary" href={downloadUrl}>{t('kb.download')}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
