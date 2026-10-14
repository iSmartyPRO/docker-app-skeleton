import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Skeleton } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate } from '../../../lib/datetime';
import { PrintLabelsDialog } from '../../../components/ui/Labels';
import { whApi } from '../api';
import { binLabel, formatQty, itemLabel, scanFeedback, toolLabel } from '../lib';
import { MobileTop, ScanBar, useMobileWarehouse, useResolver } from './parts';

/** What a scanned code is, with its stock or contents and the label to print. */
function FoundCard({ found, warehouse, onPrint }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const key = `${found.kind}:${found.item?.id || found.bin?.id || found.warehouse?.id || found.document?.id}`;
  useEffect(() => {
    let alive = true;
    setDetails(null);
    const set = (value) => alive && setDetails(value);
    if (found.kind === 'bin') whApi.stock({ group: 'bin', warehouse: found.bin.warehouseId, bin: found.bin.id }).then((res) => set(res.data)).catch(() => set({ items: [] }));
    else if (found.item) whApi.item(found.item.id).then((res) => set(res.data)).catch(() => set({ stock: [] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (found.kind === 'bin') {
    return (
      <section className="whm-card whm-found">
        <span className="whm-found__kind">{t('whm.find.bin')}</span>
        <h2>{found.bin.path}</h2>
        <p className="whm-muted">{found.warehouse?.name || warehouse?.name}</p>
        {!details ? <Skeleton active paragraph={{ rows: 3 }} /> : details.items.length ? (
          <ul className="whm-found__rows">
            {details.items.map((row) => (
              <li key={row.key}>
                <span>{row.item.name}</span>
                <strong>{formatQty(row.qty, locale)} {row.item.baseUnit}</strong>
              </li>
            ))}
          </ul>
        ) : <p className="whm-muted">{t('whm.find.binEmpty')}</p>}
        <Button size="large" block icon={<PrinterOutlined />} onClick={() => onPrint([binLabel({ ...found.bin, labelCode: `WB-${found.bin.id}` }, found.warehouse || warehouse)])}>{t('whm.find.printBin')}</Button>
      </section>
    );
  }
  if (found.kind === 'document') {
    return (
      <section className="whm-card whm-found">
        <span className="whm-found__kind">{t('whm.find.document')}</span>
        <h2>{found.document.number}</h2>
        <p>{t(`wh.types.${found.document.type}`)} · {t(`wh.status.${found.document.status}`)}</p>
        {found.document.type === 'transfer' && found.document.status === 'shipped' && <Button type="primary" size="large" block onClick={() => navigate(`/app/warehouse/m/accept/${found.document.id}`)}>{t('whm.tiles.accept')}</Button>}
        <Button size="large" block onClick={() => navigate(`/app/warehouse/documents/${found.document.id}`)}>{t('whm.done.open')}</Button>
      </section>
    );
  }
  if (found.kind === 'warehouse') {
    return (
      <section className="whm-card whm-found">
        <span className="whm-found__kind">{t('wh.fields.warehouse')}</span>
        <h2>{found.warehouse.name}</h2>
        <Button size="large" block onClick={() => navigate(`/app/warehouse/stock?warehouse=${found.warehouse.id}`)}>{t('whm.find.openStock')}</Button>
      </section>
    );
  }
  const item = found.item;
  if (!item) return null;
  const tool = found.instance;
  const atWarehouses = (details?.stock || []).filter((s) => !s.holder);
  const held = (details?.stock || []).filter((s) => s.holder);
  const total = atWarehouses.reduce((sum, s) => sum + s.qty, 0);
  return (
    <section className="whm-card whm-found">
      <span className="whm-found__kind">{tool ? t('whm.find.tool') : t('whm.find.item')}</span>
      <h2>{item.name}</h2>
      <p className="whm-muted">{[item.sku, tool?.inventoryNo, found.batch ? `${t('wh.fields.batch')} ${found.batch.number}` : null, found.unit !== item.baseUnit ? t('whm.find.pack', { unit: found.unit, factor: found.factor, base: item.baseUnit }) : null].filter(Boolean).join(' · ')}</p>
      {tool && (
        <div className="whm-found__tool">
          <span>{t('whm.find.whereNow')}</span>
          <strong>{tool.where ? [tool.where.label, tool.where.bin?.path].filter(Boolean).join(' · ') : '—'}</strong>
          <span>{t(`wh.instanceStates.${tool.state}`)}{tool.nextServiceOn ? ` · ${t('whm.find.service')} ${fmtDate(tool.nextServiceOn)}` : ''}</span>
        </div>
      )}
      {!tool && (
        <>
          <div className="whm-found__total">
            <span>{t('whm.find.inStock')}</span>
            <strong>{formatQty(total, locale)} {item.baseUnit}</strong>
          </div>
          {!details ? <Skeleton active paragraph={{ rows: 2 }} /> : (
            <ul className="whm-found__rows">
              {atWarehouses.map((s, i) => (
                <li key={`w${i}`} className={s.warehouse.id === warehouse?.id ? 'is-here' : ''}>
                  <span>{s.warehouse.name}{s.bin ? ` · ${s.bin.path}` : ''}{s.batch ? ` · ${s.batch.number}` : ''}</span>
                  <strong>{formatQty(s.qty, locale)}</strong>
                </li>
              ))}
              {held.slice(0, 6).map((s, i) => (
                <li key={`h${i}`} className="is-held">
                  <span>{s.holder.label}</span>
                  <strong>{formatQty(s.qty, locale)}</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="whm-found__actions">
        <Button size="large" icon={<PrinterOutlined />} onClick={() => onPrint([tool ? toolLabel({ ...tool, item }) : itemLabel(item)])}>{t('whm.find.print')}</Button>
        <Button size="large" onClick={() => navigate(tool ? `/app/warehouse/tools/${tool.id}` : `/app/warehouse/items/${item.id}`)}>{t('whm.find.card')}</Button>
      </div>
    </section>
  );
}

/** /app/warehouse/m/find — «Найти позицию»: scan anything, see what and where it is, print its label. */
export default function MobileFind() {
  const { t } = useLocale();
  const [warehouse] = useMobileWarehouse();
  const resolve = useResolver(warehouse?.id);
  const [found, setFound] = useState(null);
  const [recent, setRecent] = useState([]);
  const [labels, setLabels] = useState(null);
  const [camera, setCamera] = useState(true);
  const onCode = async (code) => {
    const res = await resolve(code);
    if (!res) return;
    scanFeedback(true);
    setCamera(false);
    setFound(res);
    const title = res.item?.name || res.bin?.path || res.warehouse?.name || res.document?.number || code;
    setRecent((list) => [{ code, title }, ...list.filter((r) => r.code !== code)].slice(0, 6));
  };
  return (
    <div className="whm-page">
      <MobileTop title={t('whm.tiles.find')} sub={warehouse?.name} />
      <ScanBar onCode={onCode} onPickItem={(item) => onCode(`WI-${item.id}`)} title={t('whm.tiles.find')} hint={t('whm.find.hint')} cameraOpen={camera} setCameraOpen={setCamera} />
      {found?.kind === 'ambiguous' ? (
        <section className="whm-card">
          <p>{t('whm.scan.ambiguous')}</p>
          <div className="whm-list">
            {found.matches.map((m) => (
              <button key={`${m.itemId}:${m.batch?.id}`} type="button" className="whm-row" onClick={() => onCode(`WI-${m.itemId}`)}>
                <span className="whm-row__main"><strong>{m.itemName}</strong><em>{m.batch?.number}</em></span>
              </button>
            ))}
          </div>
        </section>
      ) : found ? (
        <FoundCard found={found} warehouse={warehouse} onPrint={setLabels} />
      ) : (
        <div className="whm-empty">
          <span aria-hidden="true">🔎</span>
          <strong>{t('whm.find.emptyTitle')}</strong>
          <p>{t('whm.find.emptyText')}</p>
        </div>
      )}
      {recent.length > 1 && (
        <section className="whm-recent">
          <h3>{t('whm.find.recent')}</h3>
          {recent.slice(1).map((r) => (
            <button key={r.code} type="button" className="whm-pill" onClick={() => onCode(r.code)}>{r.title}</button>
          ))}
        </section>
      )}
      <PrintLabelsDialog open={Boolean(labels)} items={labels || []} onClose={() => setLabels(null)} />
    </div>
  );
}
