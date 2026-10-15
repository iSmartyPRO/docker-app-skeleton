import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Progress, Result, Skeleton } from 'antd';
import { CheckOutlined, CloudOutlined, CloudSyncOutlined, DisconnectOutlined, RightOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { formatQty, readStore, scanFeedback, whError, writeStore } from '../lib';
import { parseOwnCode } from './codes';
import { useCountQueue } from './offlineQueue';
import { BottomBar, MobileTop, QtySheet, ScanBar, Sheet, unitList } from './parts';

const AREA_COLORS = { todo: '#94A3B8', counting: '#0EA5E9', done: '#10B981', recount: '#F59E0B' };
const CODES_KEY = 'wh.inv.codes';

/** Codes resolved before are remembered on the device, so counting goes on without a connection. */
function rememberCode(code, found) {
  try {
    const all = readStore(CODES_KEY, {});
    const keys = Object.keys(all);
    if (keys.length > 800) for (const k of keys.slice(0, 200)) delete all[k];
    all[code] = { kind: found.kind, item: found.item ? { id: found.item.id, name: found.item.name, sku: found.item.sku, baseUnit: found.item.baseUnit, units: found.item.units, tracking: found.item.tracking, categoryId: found.item.categoryId } : null, unit: found.unit, factor: found.factor, instance: found.instance ? { id: found.instance.id, inventoryNo: found.instance.inventoryNo } : null, bin: found.bin || null };
    writeStore(CODES_KEY, all);
  } catch {
    /* storage is optional */
  }
}

function cachedCode(code) {
  return readStore(CODES_KEY, {})[code] || null;
}

/** «= 20 мешок» for a base quantity that is a whole number of the biggest pack. */
function packText(item, qty, locale) {
  const packs = [...(item?.units || [])].sort((a, b) => b.factor - a.factor);
  for (const u of packs) {
    const n = qty / u.factor;
    if (n >= 1 && Math.abs(n - Math.round(n)) < 1e-6) return `= ${formatQty(Math.round(n), locale)} ${u.code}`;
  }
  return '';
}

/** Base quantity of an op for the local preview. */
function baseOf(item, qty, unit) {
  const u = unitList(item).find((x) => x.code === unit);
  return Math.round(Number(qty) * (u?.factor || 1) * 1e4) / 1e4;
}

function SyncBadge({ queue }) {
  const { t } = useLocale();
  const n = queue.pending.length;
  if (queue.blocked && n) {
    // Signed out or refused for a moment: the counts stay on the phone and go when it works again.
    return (
      <button type="button" className="whm-sync is-off" onClick={queue.flush} role="status">
        <DisconnectOutlined /> {t(queue.blocked === 401 || queue.blocked === 'UNAUTHORIZED' ? 'whm.inv.signIn' : 'whm.inv.paused', { n })}
      </button>
    );
  }
  if (!queue.online) {
    return (
      <span className="whm-sync is-off" role="status">
        <DisconnectOutlined /> {t('whm.inv.offline', { n })}
      </span>
    );
  }
  return (
    <button type="button" className={`whm-sync${n ? ' is-pending' : ''}`} onClick={queue.flush} role="status">
      {queue.syncing ? <CloudSyncOutlined spin /> : <CloudOutlined />} {n ? t('whm.inv.pending', { n }) : t('whm.inv.synced')}
    </button>
  );
}

/** /app/warehouse/m/inventory — inventories I count in (and run). */
function InventoryList() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => {
    whApi
      .inventories({})
      .then((res) => setItems(res.data.items.filter((s) => ['counting', 'review', 'draft'].includes(s.status) || s.status === 'finished')))
      .catch(() => setItems([]));
  }, []);
  return (
    <div className="whm-page">
      <MobileTop title={t('whm.tiles.inventory')} />
      {!items ? (
        <Skeleton active />
      ) : items.length ? (
        <div className="whm-list">
          {items.slice(0, 30).map((s) => (
            <button key={s.id} type="button" className="whm-row is-big" onClick={() => navigate(['counting', 'review'].includes(s.status) ? `/app/warehouse/m/inventory/${s.id}` : `/app/warehouse/inventory/${s.id}`)} data-testid={`inv-${s.id}`}>
              <span className="whm-row__main">
                <strong>{s.number}{s.title ? ` · ${s.title}` : ''}</strong>
                <em>{s.warehouse.name} · {t(`whm.inv.status.${s.status}`)}</em>
                <Progress percent={s.progress.percent} size="small" showInfo={false} strokeColor="#10B981" />
                <em>{t('whm.inv.progress', { done: s.progress.done, total: s.progress.total })}{s.mine.areas ? ` · ${t('whm.inv.mine', { done: s.mine.done, total: s.mine.areas })}` : ''}</em>
              </span>
              <RightOutlined />
            </button>
          ))}
        </div>
      ) : (
        <div className="whm-empty">
          <span aria-hidden="true">📋</span>
          <strong>{t('whm.inv.emptyTitle')}</strong>
          <p>{t('whm.inv.emptyText')}</p>
        </div>
      )}
    </div>
  );
}

/** One session: areas (bins) with progress; scanning a bin label opens it. */
function SessionAreas({ id }) {
  const { t } = useLocale();
  const { meta } = useWh();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [all, setAll] = useState(false);
  const load = useCallback(() => whApi.inventory(id).then((res) => { setCard(res.data); writeStore(`wh.inv.card.${id}`, res.data); }).catch((err) => {
    const cached = readStore(`wh.inv.card.${id}`, null);
    if (cached && !err.response) setCard(cached);
    else setError(err);
  }), [id]);
  useEffect(() => {
    load();
  }, [load]);
  const queue = useCountQueue(id, (ops) => whApi.inventorySync(id, ops).then((res) => res.data.results), { onSynced: load, onRejected: (list) => message.error(whError({ response: { data: { code: list[0].code, error: list[0].message } } }, t)) });
  const areas = useMemo(() => card?.areas || [], [card]);
  const doneLocal = new Set(queue.pending.filter((op) => op.kind === 'done').map((op) => op.binId || 0));
  const mine = areas.filter((a) => a.assignee && a.assignee.id === meta?.me);
  const single = areas.length === 1 && !areas[0].binId && ['counting', 'review'].includes(card?.session?.status);
  useEffect(() => {
    // A warehouse without bins: straight to counting.
    if (single) navigate(`/app/warehouse/m/inventory/${id}/area/0`, { replace: true });
  }, [single, id, navigate]);
  const visible = all || !mine.length ? areas : mine;
  const onCode = async (code) => {
    const own = parseOwnCode(code);
    let binId = own?.kind === 'bin' ? own.id : null;
    if (!binId) {
      const found = await whApi.resolve(code, card.session.warehouse.id).then((r) => r.data).catch(() => null);
      if (found?.kind === 'bin') binId = found.bin.id;
    }
    const area = areas.find((a) => a.binId === binId);
    if (!area) {
      scanFeedback(false);
      message.warning(t('whm.inv.scanBinFirst'));
      return;
    }
    scanFeedback(true);
    navigate(`/app/warehouse/m/inventory/${id}/area/${binId || 0}`);
  };
  if (error) return <Result status={error?.response?.status === 404 ? '404' : 'warning'} title={whError(error, t)} />;
  if (!card) return <div className="whm-page"><Skeleton active paragraph={{ rows: 8 }} /></div>;
  const s = card.session;
  if (single) return null;
  return (
    <div className="whm-page whm-inv">
      <MobileTop title={`${s.number}${s.title ? ` · ${s.title}` : ''}`} sub={s.warehouse.name} back="/app/warehouse/m/inventory" right={<SyncBadge queue={queue} />} />
      <section className="whm-card whm-inv__head">
        <div className="whm-inv__progress">
          <Progress type="circle" percent={s.progress.percent} size={64} strokeColor="#10B981" />
          <div>
            <strong>{t('whm.inv.progress', { done: s.progress.done, total: s.progress.total })}</strong>
            <span>{t(`whm.inv.status.${s.status}`)}{s.blind ? ` · ${t('whm.inv.blind')}` : ''}</span>
            {s.scope.partial && <span className="whm-muted">{[...s.scope.bins.map((b) => b.path), ...s.scope.categories.map((c) => c.name)].join(', ')}</span>}
          </div>
        </div>
        {card.recounts.length > 0 && <div className="wh-banner is-amber whm-banner">{t('whm.inv.recountsAsked', { n: card.recounts.length })}</div>}
        {card.my.manage && <Button block onClick={() => navigate(`/app/warehouse/inventory/${id}`)}>{t('whm.inv.openReview')}</Button>}
      </section>
      <ScanBar onCode={onCode} title={s.number} hint={t('whm.inv.scanBinHint')} placeholder={t('whm.inv.binPlaceholder')} />
      {mine.length > 0 && (
        <div className="whm-segment" role="tablist">
          <button type="button" className={!all ? 'is-active' : ''} onClick={() => setAll(false)}>{t('whm.inv.myBins', { n: mine.length })}</button>
          <button type="button" className={all ? 'is-active' : ''} onClick={() => setAll(true)}>{t('whm.inv.allBins', { n: areas.length })}</button>
        </div>
      )}
      <div className="whm-areas">
        {visible.map((a) => {
          const status = doneLocal.has(a.binId || 0) ? 'done' : a.status;
          return (
            <button key={a.id} type="button" className={`whm-area is-${status}`} style={{ '--c': AREA_COLORS[status] }} onClick={() => navigate(`/app/warehouse/m/inventory/${id}/area/${a.binId || 0}`)} data-testid={`area-${a.path || 'none'}`}>
              <strong>{a.path || t('whm.inv.noBin')}</strong>
              <em>{t(`whm.inv.area.${status}`)}</em>
              {a.assignee && <small>{a.assignee.name}</small>}
              {status === 'done' && <CheckOutlined className="whm-area__check" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Counting one bin: scan items → quantity → the running list; «Ячейка посчитана». */
function AreaCount({ id, bin }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const binId = Number(bin) || null;
  const [view, setView] = useState(() => readStore(`wh.inv.area.${id}.${binId || 0}`, null));
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [pieces, setPieces] = useState(null);
  const [camera, setCamera] = useState(false);
  const sheetRef = useRef(null);
  sheetRef.current = sheet;
  const load = useCallback(
    () =>
      whApi
        .inventoryArea(id, binId)
        .then((res) => {
          setView(res.data);
          writeStore(`wh.inv.area.${id}.${binId || 0}`, res.data);
          for (const row of [...res.data.mine, ...(res.data.expected || [])]) if (row.item) rememberCode(`WI-${row.item.id}`, { kind: 'item', item: row.item, unit: row.item.baseUnit, factor: 1 });
        })
        .catch((err) => {
          if (err.response) setError(err);
        }),
    [id, binId]
  );
  useEffect(() => {
    load();
  }, [load]);
  const queue = useCountQueue(id, (ops) => whApi.inventorySync(id, ops).then((res) => res.data.results), {
    onSynced: load,
    onRejected: (list) => {
      scanFeedback(false);
      message.error(whError({ response: { data: { code: list[0].code, error: list[0].message } } }, t));
    },
  });
  // My counts here: the server's plus what is still in the queue.
  const mine = useMemo(() => {
    const map = new Map();
    for (const row of view?.mine || []) map.set(row.item.id, { item: row.item, qty: row.qty, instances: row.instances || [], pending: false });
    for (const op of queue.pending) {
      if ((op.binId || 0) !== (binId || 0) || !op.itemId || !op._item) continue;
      const entry = map.get(op.itemId) || { item: op._item, qty: 0, instances: [], pending: true };
      if (op.instanceId) {
        // A piece of a serial item: scanned (add) or taken back (set 0); the quantity is the number of pieces.
        const others = entry.instances.filter((i) => i.id !== op.instanceId);
        entry.instances = op.kind === 'set' && !op._base ? others : [...others, op._instance || { id: op.instanceId, inventoryNo: '' }];
        entry.qty = entry.instances.length;
      } else {
        entry.qty = op.kind === 'set' ? op._base : Math.max(0, Math.round((entry.qty + op._base) * 1e4) / 1e4);
      }
      entry.pending = true;
      map.set(op.itemId, entry);
    }
    return [...map.values()].filter((e) => e.qty > 0 || e.pending);
  }, [view, queue.pending, binId]);
  const doneQueued = queue.pending.some((op) => op.kind === 'done' && (op.binId || 0) === (binId || 0));

  const send = (kind, item, qty, unit, extra = {}) => {
    // A recount is decided by the server (the manager's open recount), not by a flag from the phone.
    queue.add({ kind, binId, itemId: item.id, qty, unit, ...extra, _item: { id: item.id, name: item.name, sku: item.sku, baseUnit: item.baseUnit, units: item.units, tracking: item.tracking }, _base: baseOf(item, qty, unit) });
    scanFeedback(true);
  };
  /** Serial items are counted piece by piece: the label of each tool, not a quantity. */
  const askInstance = (item) => {
    scanFeedback(false);
    message.warning({ content: t('whm.inv.scanInstance', { name: item.name }), key: 'whm-scan' });
  };
  const openSheet = (next) => {
    if (next.item?.tracking === 'serial') askInstance(next.item);
    else setSheet(next);
  };
  const commit = () => {
    const s = sheetRef.current;
    if (!s) return;
    const qty = Number(s.qty) || 0;
    if (s.mode === 'set') send('set', s.item, qty, s.unit);
    else if (qty > 0) send('add', s.item, qty, s.unit);
    setSheet(null);
  };
  const onCode = async (code) => {
    const own = parseOwnCode(code);
    if (own?.kind === 'bin' && own.id !== binId) {
      commit();
      navigate(`/app/warehouse/m/inventory/${id}/area/${own.id}`, { replace: true });
      return;
    }
    let found = null;
    try {
      found = (await whApi.resolve(code, view?.session?.warehouseId)).data;
      rememberCode(code, found);
    } catch (err) {
      if (err.response) {
        scanFeedback(false);
        message.error({ content: whError(err, t), key: 'whm-scan' });
        return;
      }
      found = cachedCode(code) || (own?.kind === 'item' ? cachedCode(`WI-${own.id}`) : null);
      if (!found) {
        scanFeedback(false);
        message.warning({ content: t('whm.inv.offlineUnknown'), key: 'whm-scan' });
        return;
      }
    }
    if (found.kind === 'bin') {
      if (found.bin.id !== binId) navigate(`/app/warehouse/m/inventory/${id}/area/${found.bin.id}`, { replace: true });
      return;
    }
    if (!found.item) {
      scanFeedback(false);
      message.warning(t('whm.scan.notItem'));
      return;
    }
    if (found.instance) {
      send('add', found.item, 1, found.item.baseUnit, { instanceId: found.instance.id, _instance: { id: found.instance.id, inventoryNo: found.instance.inventoryNo } });
      message.success({ content: `${found.item.name} · ${found.instance.inventoryNo}`, key: 'whm-scan', duration: 1 });
      return;
    }
    const current = sheetRef.current;
    if (current && current.mode === 'add' && current.item.id === found.item.id) {
      scanFeedback(true);
      setSheet({ ...current, qty: (Number(current.qty) || 0) + 1 });
      return;
    }
    if (found.item.tracking === 'serial') {
      askInstance(found.item);
      return;
    }
    if (current) commit();
    scanFeedback(true);
    setSheet({ mode: 'add', item: found.item, qty: 1, unit: found.unit || found.item.baseUnit, title: t('whm.qty.scanned') });
  };
  const removePiece = (entry, instance) => {
    send('set', entry.item, 0, entry.item.baseUnit, { instanceId: instance.id, _instance: instance });
    const left = entry.instances.filter((i) => i.id !== instance.id);
    setPieces(left.length ? { ...entry, instances: left } : null);
  };
  const markDone = () => {
    commit();
    queue.add({ kind: 'done', binId });
    message.success(t('whm.inv.binDone', { bin: view?.area?.path || t('whm.inv.noBin') }));
    navigate(`/app/warehouse/m/inventory/${id}`, { replace: true });
  };
  if (error) return <Result status="warning" title={whError(error, t)} extra={<Button onClick={() => navigate(`/app/warehouse/m/inventory/${id}`)}>{t('whm.back')}</Button>} />;
  if (!view) return <div className="whm-page"><Skeleton active paragraph={{ rows: 8 }} /></div>;
  const area = view.area;
  const done = area.status === 'done' || doneQueued;
  const countedIds = new Set(mine.map((m) => m.item.id));
  return (
    <div className="whm-page whm-inv">
      <MobileTop title={area.path ? t('whm.inv.binTitle', { bin: area.path }) : t('whm.inv.noBin')} sub={view.session.number} back={`/app/warehouse/m/inventory/${id}`} right={<SyncBadge queue={queue} />} />
      {!view.canCount && <div className="wh-banner is-amber whm-banner">{t('whm.inv.closed')}</div>}
      {view.recounts.length > 0 && (
        <div className="wh-banner is-amber whm-banner">
          {t('whm.inv.recount')}: {view.recounts.map((r) => r.itemName || t('whm.inv.wholeBin')).join(', ')}
        </div>
      )}
      {done && <div className="wh-banner is-green whm-banner">{t('whm.inv.doneBanner')}</div>}
      {view.others > 0 && <div className="wh-banner whm-banner">{t('whm.inv.others', { n: view.others })}</div>}
      <ScanBar onCode={onCode} onPickItem={(item) => openSheet({ mode: 'add', item, qty: 1, unit: item.baseUnit, title: t('whm.qty.found') })} enabled={view.canCount} title={area.path || view.session.number} hint={t('whm.inv.scanItemsHint')} cameraOpen={camera} setCameraOpen={setCamera} />
      <section className="whm-card">
        <h3 className="whm-h3">{t('whm.inv.countedByMe')}</h3>
        {mine.length ? (
          <div className="whm-lines">
            {mine.map((m) => (
              <button key={m.item.id} type="button" className={`whm-line${m.pending ? ' is-pending' : ''}`} onClick={() => view.canCount && (m.item.tracking === 'serial' ? setPieces(m) : setSheet({ mode: 'set', item: m.item, qty: m.qty, unit: m.item.baseUnit, title: t('whm.qty.correct') }))} data-testid="whm-count">
                <span className="whm-line__main">
                  <strong>{m.item.name}</strong>
                  <em>{[m.item.sku, ...m.instances.map((i) => i.inventoryNo)].filter(Boolean).join(' · ')}</em>
                  {m.pending && <em className="whm-pending">{t('whm.inv.notSent')}</em>}
                </span>
                <span className="whm-line__qty">
                  <strong>{formatQty(m.qty, locale)}</strong>
                  <small>{m.item.baseUnit}</small>
                  {packText(m.item, m.qty, locale) && <em>{packText(m.item, m.qty, locale)}</em>}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="whm-muted">{t('whm.inv.nothingYet')}</p>
        )}
      </section>
      {view.expected && view.expected.length > 0 && (
        <section className="whm-card">
          <h3 className="whm-h3">{t('whm.inv.expected')}</h3>
          <ul className="whm-expected">
            {view.expected.map((e) => (
              <li key={e.item.id} className={countedIds.has(e.item.id) ? 'is-counted' : ''}>
                <button type="button" onClick={() => view.canCount && openSheet({ mode: 'add', item: e.item, qty: 1, unit: e.item.baseUnit, title: t('whm.qty.found') })}>
                  <span>{e.item.name}</span>
                  <strong>{formatQty(e.book, locale)} {e.item.baseUnit}</strong>
                  {countedIds.has(e.item.id) && <CheckOutlined />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.canCount && (
        <BottomBar>
          <Button type="primary" size="large" block icon={<CheckOutlined />} onClick={markDone} data-testid="whm-bin-done">{t('whm.inv.markDone')}</Button>
        </BottomBar>
      )}
      <QtySheet
        open={Boolean(sheet)}
        item={sheet?.item}
        qty={sheet?.qty}
        unit={sheet?.unit}
        title={sheet?.title}
        extra={area.path}
        onChange={(next) => setSheet((s) => ({ ...s, ...next }))}
        onSubmit={commit}
        onScanCode={(code, { qty }) => {
          // A wedge scanner typed into the quantity: the quantity stays as it was, the code is a scan.
          if (sheetRef.current) sheetRef.current = { ...sheetRef.current, qty };
          onCode(code);
        }}
        onClose={() => setSheet(null)}
        submitLabel={sheet?.mode === 'set' ? t('whm.qty.save') : t('whm.qty.add')}
        allowZero={sheet?.mode === 'set'}
      />
      <Sheet open={Boolean(pieces)} onClose={() => setPieces(null)} title={pieces?.item?.name}>
        <p className="whm-muted">{t('whm.inv.piecesHint')}</p>
        <div className="whm-list">
          {(pieces?.instances || []).map((instance) => (
            <div key={instance.id} className="whm-row">
              <span className="whm-row__main">
                <strong>{instance.inventoryNo || `#${instance.id}`}</strong>
              </span>
              <Button danger onClick={() => removePiece(pieces, instance)} data-testid="whm-piece-remove">{t('whm.inv.removePiece')}</Button>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/** /app/warehouse/m/inventory[/:id[/area/:bin]] — counting from the phone (spec §6.2), offline-tolerant. */
export default function MobileInventory() {
  const { id, bin } = useParams();
  if (!id) return <InventoryList />;
  if (bin !== undefined) return <AreaCount key={`${id}:${bin}`} id={id} bin={bin} />;
  return <SessionAreas key={id} id={id} />;
}
