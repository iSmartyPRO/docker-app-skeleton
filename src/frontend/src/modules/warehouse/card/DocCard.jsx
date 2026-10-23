import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Drawer, Dropdown, Grid, Input, InputNumber, Modal, Result, Skeleton, Table, Tabs } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime } from '../../../lib/datetime';
import { PrintLabelsDialog } from '../../../components/ui/Labels';
import { inboxChanged } from '../../approvals/public';
import ApprovalPath from '../../approvals/public/ApprovalPath';
import ApprovalActions from '../../approvals/public/ApprovalActions';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { conversionText, formatQty, itemLabel, whError } from '../lib';
import { BinSelect, FilesBlock, Money, Qty, SignaturePad, StatusPill, StockHint, TypeTag } from '../components/bits';
import { Route } from '../pages/DocumentsPage';
import FreezeBanner from '../components/FreezeBanner';

const TYPE = 'warehouse.document';

function overlayOpen() {
  return Boolean(document.querySelector('.ant-modal-wrap:not([style*="display: none"]), .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden)'));
}

/** Lines with the stock hint «на складе · резерв · доступно» and the shortage highlight. */
export function LinesTable({ data }) {
  const { t, locale } = useLocale();
  const { meta } = useWh();
  const screens = Grid.useBreakpoint();
  const doc = data.document;
  const showHints = data.lines.some((line) => line.hint);
  const columns = [
    {
      key: 'item',
      title: t('wh.fields.item'),
      render: (_, line) => (
        <span className="wh-item-cell">
          <strong>{line.item?.name || line.nameHint || '—'}</strong>
          <em>
            {[line.item?.sku, line.instance?.inventoryNo, line.batch ? `${t('wh.fields.batch')} ${line.batch.number}` : line.batchNumber ? `${t('wh.fields.batch')} ${line.batchNumber}` : null, line.bin?.path, line.toBin ? `→ ${line.toBin.path}` : null, line.reserve ? `${t('wh.lines.byReserve')} ${line.reserve.label}` : null]
              .filter(Boolean)
              .join(' · ')}
          </em>
          {!line.item && <em className="wh-red">{t('wh.lines.pickItem')}</em>}
          {showHints && line.hint && <StockHint hint={line.hint} short={line.short} />}
        </span>
      ),
    },
    {
      key: 'qty',
      title: t('wh.fields.qty'),
      align: 'right',
      width: 150,
      render: (_, line) => (
        <span className="wh-qty-cell">
          <Qty value={line.qty} unit={line.unit} strong tone={line.short ? 'red' : null} />
          {conversionText(line, locale) && <small>{conversionText(line, locale)}</small>}
          {line.countedQty !== null && <small>{t('wh.lines.counted')} {formatQty(line.countedQty, locale)} · {t('wh.lines.book')} {formatQty(line.bookQty, locale)}</small>}
        </span>
      ),
    },
    doc.type === 'transfer' && doc.status === 'posted' && { key: 'received', title: t('wh.lines.received'), align: 'right', width: 110, render: (_, line) => <Qty value={line.receivedQty ?? line.qty} tone={line.receivedQty !== null && line.receivedQty !== line.qty ? 'amber' : null} /> },
    meta.rights.cost && { key: 'price', title: t('wh.fields.price'), align: 'right', width: 110, render: (_, line) => <Money amount={line.price} currency={doc.currency} /> },
    meta.rights.cost && { key: 'amount', title: t('wh.fields.amount'), align: 'right', width: 120, render: (_, line) => <Money amount={line.amount} /> },
  ].filter(Boolean);
  if (!screens.md) {
    // Phones: each line as a small card, no sideways scrolling.
    return (
      <div className="wh-mlines">
        {data.lines.map((line) => (
          <div key={line.id} className={`wh-mline${line.short ? ' is-short' : ''}`}>
            {columns[0].render(null, line)}
            <span className="wh-mline__side">
              {columns[1].render(null, line)}
              {line.receivedQty !== null && doc.type === 'transfer' && <small>{t('wh.lines.received')} {formatQty(line.receivedQty, locale)}</small>}
              {meta.rights.cost && <Money amount={line.amount} />}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <Table size="small" rowKey="id" columns={columns} dataSource={data.lines} pagination={data.lines.length > 100 ? { pageSize: 100 } : false} rowClassName={(line) => (line.short ? 'is-red' : '')} scroll={{ x: 'max-content' }} />;
}

/** Accepting a transfer: received quantity per line (spec §5 «с проверкой количества»), bins of the destination. */
function ReceiveDialog({ data, open, onClose, onDone }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [rows, setRows] = useState(() => data.lines.map((line) => ({ lineId: line.id, receivedQty: line.qty, toBinId: null })));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const diff = rows.some((row, index) => Number(row.receivedQty) !== data.lines[index].qty);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await whApi.action(data.document.id, 'receive', { lines: rows, comment });
      message.success(diff ? t('wh.done.receivedWithAct') : t('wh.done.received'));
      onDone(res.data);
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onCancel={onClose} title={t('wh.receive.title', { number: data.document.number })} okText={diff ? t('wh.receive.withAct') : t('wh.receive.accept')} onOk={submit} confirmLoading={busy} width={680} destroyOnClose>
      <p className="wh-muted">{t('wh.receive.lead')}</p>
      <div className="wh-receive">
        {data.lines.map((line, index) => (
          <div key={line.id} className={`wh-receive__row${Number(rows[index].receivedQty) !== line.qty ? ' is-diff' : ''}`}>
            <span className="wh-item-cell">
              <strong>{line.item?.name}</strong>
              <em>{t('wh.receive.shipped')} {formatQty(line.qty)} {line.unit}{line.instance ? ` · ${line.instance.inventoryNo}` : ''}</em>
            </span>
            <InputNumber min={0} value={rows[index].receivedQty} onChange={(value) => setRows(rows.map((r, i) => (i === index ? { ...r, receivedQty: value ?? 0 } : r)))} addonAfter={line.unit} style={{ width: 150 }} />
            <BinSelect warehouseId={data.document.toWarehouse?.id} value={rows[index].toBinId} onChange={(bin) => setRows(rows.map((r, i) => (i === index ? { ...r, toBinId: bin } : r)))} size="middle" />
          </div>
        ))}
      </div>
      {diff && <div className="wh-banner is-amber">{t('wh.receive.diffNote')}</div>}
      <Input.TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('wh.receive.comment')} autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
    </Modal>
  );
}

function HistoryTab({ id, refreshKey }) {
  const { t } = useLocale();
  const [items, setItems] = useState(null);
  useEffect(() => {
    whApi.history(id).then((res) => setItems(res.data.history)).catch(() => setItems([]));
  }, [id, refreshKey]);
  if (!items) return <Skeleton active />;
  return (
    <ul className="wh-history">
      {items.map((event) => (
        <li key={event.id}>
          <span className="wh-history__dot" />
          <span>
            <strong>{t(`wh.history.${event.action.replace('.', '_')}`)}</strong>
            {event.data?.comment && <em> — {event.data.comment}</em>}
            {event.data?.reason && <em> — {event.data.reason}</em>}
            {event.data?.number && <em> {event.data.number}</em>}
            {event.data?.storno && <em> {event.data.storno}</em>}
            {event.data?.act && <em> {event.data.act}</em>}
          </span>
          <small>{[event.actor?.name, fmtDateTime(event.at)].filter(Boolean).join(' · ')}</small>
        </li>
      ))}
    </ul>
  );
}

/**
 * The document card over the list (spec §8.4): type, number, status, from → to,
 * date; the approval path; lines with stock hints; attachments, signature,
 * history. ↑/↓ move through the list.
 */
export default function DocCard({ id, ids = [], onOpen, onClose, onChanged }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { meta } = useWh();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [tab, setTab] = useState('lines');
  const [historyKey, setHistoryKey] = useState(0);
  const [labels, setLabels] = useState(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await whApi.document(id);
      if (mine === seq.current) {
        setData(res.data);
        setError(null);
      }
    } catch (err) {
      if (mine === seq.current) setError(err);
    }
  }, [id]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  useEffect(() => {
    const onKey = (event) => {
      if (overlayOpen() || event.target.closest?.('input, textarea, [contenteditable="true"], canvas')) return;
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const index = ids.indexOf(id);
      const next = ids[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (index >= 0 && next) {
        event.preventDefault();
        onOpen(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, ids, onOpen, onClose]);
  const changed = (next) => {
    if (next?.document) setData(next);
    else load();
    setHistoryKey((n) => n + 1);
    onChanged?.();
  };
  const run = async (key, call, done) => {
    setBusy(key);
    try {
      const res = await call();
      changed(res?.data);
      inboxChanged();
      if (done) message.success(done);
      return res;
    } catch (err) {
      message.error(whError(err, t));
      return null;
    } finally {
      setBusy(null);
    }
  };
  const stornoDialog = () => {
    let reason = '';
    modal.confirm({
      title: t('wh.actions.stornoTitle'),
      content: (
        <div className="wh-confirm">
          <p>{t('wh.actions.stornoText')}</p>
          <Input.TextArea autoFocus autoSize={{ minRows: 2 }} maxLength={1000} placeholder={t('wh.actions.reason')} onChange={(e) => (reason = e.target.value)} />
        </div>
      ),
      okText: t('wh.actions.storno'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        if (!reason.trim()) {
          message.warning(t('wh.errors.REASON_REQUIRED'));
          return Promise.reject(new Error('reason'));
        }
        return run('storno', () => whApi.action(id, 'storno', { reason }), t('wh.done.storno')).then((res) => res && navigate(`/app/warehouse/documents/${res.data.document.id}`));
      },
    });
  };
  const remove = () =>
    modal.confirm({
      title: t('wh.actions.deleteTitle'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () =>
        whApi
          .deleteDocument(id)
          .then(() => {
            onChanged?.();
            onClose();
          })
          .catch((err) => message.error(whError(err, t))),
    });
  const orderShortage = () =>
    run('order', () => whApi.orderShortage(id)).then((res) => {
      if (!res) return;
      message.success(t('wh.done.ordered', { number: res.data.request.number }));
      navigate(`/app/procurement/requests/${res.data.request.id}/edit`);
    });
  const doc = data?.document;
  const my = data?.my || {};
  const header = doc ? (
    <div className="wh-card__head">
      <div>
        <div className="wh-card__eyebrow">
          <span className="wh-card__no">{doc.number}</span>
          <TypeTag type={doc.type} />
          <StatusPill status={doc.status} />
        </div>
        <h2 className="wh-card__title"><Route doc={doc} /></h2>
        <div className="wh-card__facts">
          <span>{fmtDateTime(doc.date)}</span>
          {doc.author && <span className="wh-muted">{doc.author.name}</span>}
          {doc.sum !== null && doc.sum !== undefined && <Money amount={doc.sum} strong />}
        </div>
      </div>
    </div>
  ) : (
    <Skeleton.Input active size="small" />
  );
  const more = doc
    ? [
        doc.type === 'receipt' && { key: 'labels', label: t('wh.labels.printReceived'), onClick: () => setLabels(data.lines.filter((l) => l.item).map((l) => itemLabel({ ...l.item, labelCode: undefined, id: l.item.id }))) },
        my.shortages && meta.modules?.procurement && { key: 'order', label: t('wh.actions.orderShortage'), onClick: orderShortage },
        my.delete && { type: 'divider' },
        my.delete && { key: 'delete', danger: true, label: t('wh.actions.delete'), onClick: remove },
      ].filter(Boolean)
    : [];
  const process = data?.approval;
  const tabs = doc
    ? [
        { key: 'lines', label: `${t('wh.card.lines')} · ${data.lines.length}`, children: <LinesTable data={data} /> },
        { key: 'files', label: `${t('wh.card.files')}${data.files.length ? ` · ${data.files.length}` : ''}`, children: <FilesBlock owner="documents" ownerId={doc.id} files={data.files} kinds={['waybill', 'photo', 'act', 'invoice', 'other']} canEdit={!['reversed', 'cancelled'].includes(doc.status)} onChanged={() => changed()} /> },
        { key: 'history', label: t('wh.card.history'), children: tab === 'history' ? <HistoryTab id={doc.id} refreshKey={historyKey} /> : null },
      ]
    : [];
  return (
    <Drawer open onClose={onClose} width={screens.md ? 820 : '100%'} className="wh-card" title={header} destroyOnClose mask={!screens.md} extra={ids.length > 1 && ids.includes(id) && screens.md ? <span className="wh-card__nav">{ids.indexOf(id) + 1} / {ids.length} <kbd>↑</kbd><kbd>↓</kbd></span> : null}>
      {error ? (
        <Result status={error?.response?.status === 404 ? '404' : 'warning'} title={error?.response?.status === 404 ? t('wh.card.notFound') : whError(error, t)} />
      ) : !doc ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          {my.shortages && ['draft', 'requested', 'approved'].includes(doc.status) && (
            <div className="wh-banner is-red">
              <span>{t('wh.card.shortage')}</span>
              {meta.modules?.procurement && <Button size="small" loading={busy === 'order'} onClick={orderShortage}>{t('wh.actions.orderShortage')}</Button>}
            </div>
          )}
          {doc.status === 'shipped' && <div className="wh-banner is-violet">{t('wh.card.inTransit', { date: fmtDateTime(doc.shippedAt) })}</div>}
          {doc.status === 'approved' && <div className="wh-banner is-amber">{t('wh.card.approvedNotPosted')}</div>}
          {doc.base && <div className="wh-banner"><span>{t('wh.card.base')}</span><Button type="link" size="small" onClick={() => navigate(`/app/warehouse/documents/${doc.base.id}`)}>{doc.base.number}</Button></div>}
          {doc.derived?.length > 0 && (
            <div className="wh-banner">
              <span>{t('wh.card.derived')}</span>
              {doc.derived.map((d) => <Button key={d.id} type="link" size="small" onClick={() => navigate(`/app/warehouse/documents/${d.id}`)}>{d.number} · {t(`wh.types.${d.type}`)}</Button>)}
            </div>
          )}
          {['draft', 'requested', 'approved', 'shipped'].includes(doc.status) && doc.type !== 'inventory' && <FreezeBanner warehouseId={doc.status === 'shipped' ? doc.toWarehouse?.id : doc.warehouse?.id || doc.toWarehouse?.id} />}
          {doc.inventorySession && <div className="wh-banner"><span>{t('whm.inv.fromSession')}</span><Button type="link" size="small" onClick={() => navigate(doc.inventorySession.url)}>{doc.inventorySession.number}</Button></div>}
          {process && <ApprovalPath process={process} />}
          <div className="wh-card__actions">
            {process && (process.my?.canDecide || process.my?.canAnswer || process.my?.canWithdraw || process.my?.canRestart) && <ApprovalActions type={TYPE} docId={doc.id} process={process} onChange={() => changed()} />}
            {my.post && <Button type="primary" size="large" loading={busy === 'post'} onClick={() => run('post', () => whApi.action(id, 'post'), t('wh.done.posted'))}>{t('wh.actions.post')}</Button>}
            {my.ship && <Button type="primary" size="large" loading={busy === 'ship'} onClick={() => run('ship', () => whApi.action(id, 'ship'), t('wh.done.shipped'))}>{t('wh.actions.ship')}</Button>}
            {my.receive && <Button type="primary" size="large" onClick={() => setDialog('receive')}>{t('wh.actions.receive')}</Button>}
            {my.request && <Button type="primary" size="large" loading={busy === 'request'} onClick={() => run('request', () => whApi.action(id, 'request'), t('wh.done.requested'))}>{t('wh.actions.request')}</Button>}
            {my.confirm && <Button type="primary" size="large" loading={busy === 'confirm'} onClick={() => run('confirm', () => whApi.action(id, 'confirm'), t('wh.done.confirmed'))}>{t('wh.actions.confirm')}</Button>}
            {my.decline && <Button size="large" danger loading={busy === 'decline'} onClick={() => run('decline', () => whApi.action(id, 'decline'))}>{t('wh.actions.decline')}</Button>}
            {my.edit && <Button size="large" onClick={() => navigate(`/app/warehouse/documents/${id}/edit`)}>{t('wh.edit')}</Button>}
            {my.sign && !doc.signedAt && <Button size="large" onClick={() => setDialog('sign')}>{t('wh.actions.sign')}</Button>}
            {my.storno && <Button size="large" danger onClick={stornoDialog}>{t('wh.actions.storno')}</Button>}
            {more.length > 0 && (
              <Dropdown menu={{ items: more }} trigger={['click']}>
                <Button size="large" aria-label={t('wh.more')}>⋯</Button>
              </Dropdown>
            )}
          </div>
          <dl className="wh-facts">
            {doc.reason && <><dt>{t('wh.fields.reason')}</dt><dd>{t(`wh.reasons.${doc.reason}`)}{doc.reasonText ? ` — ${doc.reasonText}` : ''}</dd></>}
            {!doc.reason && doc.reasonText && <><dt>{t('wh.fields.reason')}</dt><dd>{doc.reasonText}</dd></>}
            {doc.supplier && <><dt>{t('wh.fields.supplier')}</dt><dd>{doc.supplier.name}</dd></>}
            {doc.procurement && <><dt>{t('wh.fields.procurement')}</dt><dd><Button type="link" size="small" onClick={() => navigate(`/app/procurement/requests/${doc.procurement.id}`)}>{doc.procurement.label}</Button></dd></>}
            {doc.returnBy && <><dt>{t('wh.fields.returnBy')}</dt><dd>{fmtDate(doc.returnBy)}</dd></>}
            {doc.signedAt && <><dt>{t('wh.fields.signed')}</dt><dd>{[doc.signedName, fmtDateTime(doc.signedAt)].filter(Boolean).join(' · ')}</dd></>}
            {doc.comment && <><dt>{t('wh.fields.comment')}</dt><dd>{doc.comment}</dd></>}
            {doc.postedAt && <><dt>{t('wh.fields.postedAt')}</dt><dd>{[fmtDateTime(doc.postedAt), doc.postedBy?.name].filter(Boolean).join(' · ')}</dd></>}
          </dl>
          <Tabs activeKey={tab} onChange={setTab} items={tabs} />
          {data.files.some((f) => f.kind === 'signature') && (
            <div className="wh-signature-view">
              <span>{t('wh.files.signature')}</span>
              <img src={data.files.find((f) => f.kind === 'signature').url} alt={t('wh.files.signature')} />
            </div>
          )}
        </>
      )}
      {doc && dialog === 'receive' && <ReceiveDialog data={data} open onClose={() => setDialog(null)} onDone={(next) => { setDialog(null); changed(next); }} />}
      {doc && (
        <Modal open={dialog === 'sign'} onCancel={() => setDialog(null)} footer={null} title={t('wh.sign.title')} destroyOnClose width={560}>
          <SignaturePad busy={busy === 'sign'} onSave={(image, name) => run('sign', () => whApi.sign(id, image, name), t('wh.done.signed')).then((res) => res && setDialog(null))} />
        </Modal>
      )}
      <PrintLabelsDialog open={Boolean(labels)} items={labels || []} onClose={() => setLabels(null)} />
    </Drawer>
  );
}
