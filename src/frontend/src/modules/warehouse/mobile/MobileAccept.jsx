import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Input, Result, Skeleton, Switch } from 'antd';
import { MinusOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDateTime } from '../../../lib/datetime';
import { inboxChanged } from '../../approvals/api';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { formatQty, scanFeedback, whError } from '../lib';
import { BinSelect } from '../components/bits';
import { BottomBar, MobileTop, ScanBar, SuccessScreen, WarehouseChip, useMobileWarehouse, useResolver } from './parts';

/** The list of transfers waiting for acceptance at the chosen warehouse; scanning a transfer number opens it. */
function AcceptList() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [warehouse, setWarehouse, list] = useMobileWarehouse();
  const [docs, setDocs] = useState(null);
  const resolve = useResolver(warehouse?.id);
  useEffect(() => {
    whApi
      .documents({ chip: 'awaiting_receipt', warehouse: warehouse?.id, pageSize: 50 })
      .then((res) => setDocs(res.data.items.filter((d) => d.toWarehouse?.id === warehouse?.id || !warehouse)))
      .catch(() => setDocs([]));
  }, [warehouse?.id]);
  const onCode = async (code) => {
    const found = await resolve(code);
    if (!found) return;
    if (found.kind === 'document' && found.document.type === 'transfer') {
      scanFeedback(true);
      navigate(`/app/warehouse/m/accept/${found.document.id}`);
    } else {
      scanFeedback(false);
      message.warning(t('whm.accept.scanTransfer'));
    }
  };
  return (
    <div className="whm-page">
      <MobileTop title={t('whm.tiles.accept')} right={<WarehouseChip warehouse={warehouse} list={list} onChange={setWarehouse} filter={(w) => (w.rights || []).includes('operate')} />} />
      <ScanBar onCode={onCode} title={t('whm.tiles.accept')} hint={t('whm.accept.scanHint')} placeholder={t('whm.accept.placeholder')} />
      {!docs ? (
        <Skeleton active />
      ) : docs.length ? (
        <div className="whm-list">
          {docs.map((d) => (
            <button key={d.id} type="button" className="whm-row is-big" onClick={() => navigate(`/app/warehouse/m/accept/${d.id}`)} data-testid={`accept-${d.id}`}>
              <span className="whm-row__main">
                <strong>{d.number}</strong>
                <em>{d.warehouse?.name} → {d.toWarehouse?.name}</em>
                <em>{t('whm.flow.positions', { n: d.lines })} · {fmtDateTime(d.shippedAt)}</em>
              </span>
              <RightOutlined />
            </button>
          ))}
        </div>
      ) : (
        <div className="whm-empty">
          <span aria-hidden="true">🚚</span>
          <strong>{t('whm.accept.emptyTitle')}</strong>
          <p>{t('whm.accept.emptyText')}</p>
        </div>
      )}
    </div>
  );
}

/** Accepting one transfer: received quantity per line (default as shipped), the bin, scanning to check. */
function AcceptDoc({ id }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { touch } = useWh();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [check, setCheck] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const resolve = useResolver(data?.document?.toWarehouse?.id);
  useEffect(() => {
    whApi
      .document(id)
      .then((res) => {
        setData(res.data);
        setRows(res.data.lines.map((line) => ({ lineId: line.id, receivedQty: line.qty, toBinId: line.toBin?.id || null })));
      })
      .catch(setError);
  }, [id]);
  const setRow = (index, patch) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const toggleCheck = (on) => {
    setCheck(on);
    setRows((list) => list.map((r, i) => ({ ...r, receivedQty: on ? 0 : data.lines[i].qty })));
  };
  const onCode = useCallback(
    async (code) => {
      const found = await resolve(code);
      if (!found?.item) return;
      const index = data.lines.findIndex((line) => line.item?.id === found.item.id && (!found.instance || line.instance?.id === found.instance.id));
      if (index < 0) {
        scanFeedback(false);
        message.warning(t('whm.accept.notInTransfer', { name: found.item.name }));
        return;
      }
      scanFeedback(true);
      const line = data.lines[index];
      // A pack barcode counts a pack: convert into the line's unit.
      const add = found.factor && line.factor ? Math.round(((found.factor || 1) / (line.factor || 1)) * 1e4) / 1e4 : 1;
      setRows((list) => list.map((r, i) => (i === index ? { ...r, receivedQty: Math.round((Number(r.receivedQty) + add) * 1e4) / 1e4 } : r)));
      document.getElementById(`whm-acc-${line.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [resolve, data, message, t]
  );
  if (error) return <Result status="warning" title={whError(error, t)} />;
  if (!data) return <div className="whm-page"><Skeleton active paragraph={{ rows: 8 }} /></div>;
  const doc = data.document;
  if (done) {
    return (
      <div className="whm-page">
        <SuccessScreen tone={done.act ? 'amber' : 'green'} icon={done.act ? '⚖' : '✓'} title={t(done.act ? 'whm.accept.doneAct' : 'whm.accept.done', { number: doc.number, act: done.act || '' })} text={done.act ? t('whm.accept.doneActText') : null}>
          <Button type="primary" size="large" block onClick={() => navigate('/app/warehouse/m/accept')}>{t('whm.accept.next')}</Button>
          <Button size="large" block onClick={() => navigate('/app/warehouse/m')}>{t('whm.toHome')}</Button>
        </SuccessScreen>
      </div>
    );
  }
  if (!data.my.receive) {
    return (
      <div className="whm-page">
        <MobileTop title={doc.number} back="/app/warehouse/m/accept" />
        <Result status="info" title={doc.status === 'shipped' ? t('wh.errors.FORBIDDEN') : t('whm.accept.notWaiting')} />
      </div>
    );
  }
  const diff = rows.some((r, i) => Number(r.receivedQty) !== data.lines[i].qty);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await whApi.action(doc.id, 'receive', { lines: rows, comment });
      const act = res.data.document.derived?.find((d) => d.type === 'discrepancy');
      setDone({ act: act?.number || null });
      inboxChanged();
      touch();
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="whm-page">
      <MobileTop title={`${t('whm.accept.title')} ${doc.number}`} sub={`${doc.warehouse?.name} → ${doc.toWarehouse?.name}`} back="/app/warehouse/m/accept" />
      <ScanBar onCode={onCode} title={doc.number} hint={t('whm.accept.checkHint')} />
      <label className="whm-toggle whm-toolrow">
        <Switch size="small" checked={check} onChange={toggleCheck} />
        <span>{t('whm.accept.checkMode')}</span>
      </label>
      <div className="whm-lines">
        {data.lines.map((line, index) => {
          const r = rows[index];
          const changed = Number(r.receivedQty) !== line.qty;
          return (
            <div key={line.id} id={`whm-acc-${line.id}`} className={`whm-accept${changed ? ' is-diff' : ''}`}>
              <div className="whm-accept__head">
                <strong>{line.item?.name}</strong>
                <em>{t('wh.receive.shipped')} {formatQty(line.qty, locale)} {line.unit}{line.instance ? ` · ${line.instance.inventoryNo}` : ''}</em>
              </div>
              <div className="whm-accept__row">
                <div className="whm-mini-stepper">
                  <button type="button" onClick={() => setRow(index, { receivedQty: Math.max(0, Number(r.receivedQty) - 1) })} aria-label={t('whm.qty.less')}><MinusOutlined /></button>
                  <input type="text" inputMode="decimal" value={String(r.receivedQty)} onChange={(e) => setRow(index, { receivedQty: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} aria-label={t('wh.lines.received')} />
                  <button type="button" onClick={() => setRow(index, { receivedQty: Number(r.receivedQty) + 1 })} aria-label={t('whm.qty.more')}><PlusOutlined /></button>
                </div>
                <span className="whm-muted">{line.unit}</span>
                <BinSelect warehouseId={doc.toWarehouse?.id} value={r.toBinId} onChange={(toBinId) => setRow(index, { toBinId })} size="large" />
              </div>
              {changed && <span className="whm-diff">{Number(r.receivedQty) > line.qty ? '+' : ''}{formatQty(Number(r.receivedQty) - line.qty, locale)} {line.unit}</span>}
            </div>
          );
        })}
      </div>
      {diff && <div className="wh-banner is-amber whm-banner">{t('wh.receive.diffNote')}</div>}
      <Input.TextArea className="whm-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('wh.receive.comment')} autoSize={{ minRows: 2, maxRows: 4 }} maxLength={2000} />
      <BottomBar>
        <Button type="primary" size="large" block loading={busy} onClick={submit} data-testid="whm-accept">
          {diff ? t('wh.receive.withAct') : t('wh.receive.accept')}
        </Button>
      </BottomBar>
    </div>
  );
}

/** /app/warehouse/m/accept[/:id] — «Принять перемещение». */
export default function MobileAccept() {
  const { id } = useParams();
  return id ? <AcceptDoc key={id} id={id} /> : <AcceptList />;
}
