import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, DatePicker, Drawer, Dropdown, Grid, Input, InputNumber, Result, Select, Skeleton, Table, Tabs } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { fmtDate, fmtDateTime, dayFromPicker } from '../../../lib/datetime';
import { PrintLabelsDialog } from '../../../components/ui/Labels';
import { ScanButton } from '../../../components/ui/BarcodeScanner';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { formatQty, itemLabel, toolLabel, whError } from '../lib';
import { Empty, FilesBlock, Money, Qty, TypeTag, WarehouseSelect } from '../components/bits';
import ItemForm from '../components/ItemForm';

/** Stock of the item per warehouse, bin, batch, instance, holder. */
function StockTab({ data }) {
  const { t } = useLocale();
  const { meta } = useWh();
  if (!data.stock.length) return <Empty icon="📭" title={t('wh.item.noStock')} />;
  const rows = data.stock.map((s, index) => ({ ...s, key: index }));
  return (
    <Table
      size="small"
      rowKey="key"
      pagination={false}
      dataSource={rows}
      scroll={{ x: 'max-content' }}
      columns={[
        { key: 'where', title: t('wh.fields.where'), render: (_, s) => <span className="wh-item-cell"><strong>{s.holder ? s.holder.label : s.warehouse.name}</strong><em>{s.holder ? `${t(`wh.holders.${s.holder.type}`)} · ${s.warehouse.name}` : s.bin?.path || ''}</em></span> },
        { key: 'batch', title: t('wh.fields.batchOrSerial'), render: (_, s) => (s.instance ? s.instance.inventoryNo : s.batch ? `${s.batch.number}${s.batch.expiresOn ? ` · ${fmtDate(s.batch.expiresOn)}` : ''}` : '—') },
        { key: 'qty', title: t('wh.fields.qty'), align: 'right', render: (_, s) => <Qty value={s.qty} unit={data.item.baseUnit} strong /> },
        meta.rights.cost && { key: 'amount', title: t('wh.fields.amount'), align: 'right', render: (_, s) => <Money amount={s.amount} /> },
      ].filter(Boolean)}
    />
  );
}

function MovesTab({ data }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  if (!data.moves.length) return <Empty icon="🕊️" title={t('wh.item.noMoves')} />;
  return (
    <ul className="wh-moves">
      {data.moves.map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => navigate(`/app/warehouse/documents/${m.docId}`)}>
            <TypeTag type={m.type} compact />
            <span className="wh-moves__text">
              <strong>{m.number}</strong>
              <em>{m.warehouse.name} · {fmtDateTime(m.movedAt)}</em>
            </span>
            <Qty value={m.qty} unit={data.item.baseUnit} strong tone={m.qty < 0 ? 'red' : 'green'} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReservesTab({ data, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { can } = useWh();
  const [form, setForm] = useState({ warehouseId: null, qty: null, targetLabel: '', expiresOn: null });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await whApi.createReserve({ itemId: data.item.id, warehouseId: form.warehouseId, qty: form.qty, targetType: 'other', targetLabel: form.targetLabel, expiresOn: form.expiresOn });
      message.success(t('wh.reserve.created'));
      setForm({ warehouseId: form.warehouseId, qty: null, targetLabel: '', expiresOn: null });
      onChanged();
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const release = async (id) => {
    try {
      await whApi.releaseReserve(id);
      onChanged();
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  return (
    <div className="wh-stack">
      {data.reserves.length ? (
        <ul className="wh-list">
          {data.reserves.map((r) => (
            <li key={r.id}>
              <span className="wh-item-cell">
                <strong>{r.targetLabel || t(`wh.reserveTargets.${r.targetType}`)}</strong>
                <em>{r.warehouse.name}{r.expiresOn ? ` · ${t('wh.reserve.until', { date: fmtDate(r.expiresOn) })}` : ''}</em>
              </span>
              <Qty value={r.qty} unit={data.item.baseUnit} strong />
              {can('operate', r.warehouse.id) && <Button size="small" onClick={() => release(r.id)}>{t('wh.reserve.release')}</Button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="wh-muted">{t('wh.reserve.none')}</p>
      )}
      <div className="wh-subform">
        <strong>{t('wh.reserve.new')}</strong>
        <div className="wh-subform__row">
          <WarehouseSelect right="operate" value={form.warehouseId} onChange={(id) => setForm({ ...form, warehouseId: id })} style={{ minWidth: 160 }} />
          <InputNumber min={0} value={form.qty} onChange={(qty) => setForm({ ...form, qty })} placeholder={t('wh.fields.qty')} addonAfter={data.item.baseUnit} />
          <Input value={form.targetLabel} onChange={(e) => setForm({ ...form, targetLabel: e.target.value })} placeholder={t('wh.reserve.target')} maxLength={300} />
          <DatePicker onChange={(d) => setForm({ ...form, expiresOn: dayFromPicker(d) })} placeholder={t('wh.reserve.expires')} />
          <Button type="primary" loading={busy} disabled={!form.warehouseId || !form.qty} onClick={create}>{t('wh.reserve.create')}</Button>
        </div>
      </div>
    </div>
  );
}

function NormsTab({ data, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { warehouses, can } = useWh();
  const editable = warehouses.filter((w) => !w.archived && can('admin', w.id));
  const [rows, setRows] = useState(() => editable.map((w) => {
    const norm = data.norms.find((n) => n.warehouseId === w.id);
    return { warehouseId: w.id, name: w.name, minQty: norm?.minQty ?? null, reorderQty: norm?.reorderQty ?? null };
  }));
  const [busy, setBusy] = useState(false);
  if (!editable.length) {
    return data.norms.length ? (
      <ul className="wh-list">{data.norms.map((n) => <li key={n.warehouseId}><strong>{n.warehouseName}</strong><span>{t('wh.fields.minQty')}: {n.minQty ?? '—'} · {t('wh.fields.reorderQty')}: {n.reorderQty ?? '—'}</span></li>)}</ul>
    ) : <p className="wh-muted">{t('wh.item.noNorms')}</p>;
  }
  const save = async () => {
    setBusy(true);
    try {
      await whApi.saveNorms(data.item.id, rows);
      message.success(t('wh.saved'));
      onChanged();
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wh-stack">
      <p className="wh-muted">{t('wh.item.normsLead')}</p>
      {rows.map((row, index) => (
        <div key={row.warehouseId} className="wh-norm-row">
          <strong>{row.name}</strong>
          <InputNumber min={0} value={row.minQty} onChange={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, minQty: v } : r)))} placeholder={t('wh.fields.minQty')} addonAfter={data.item.baseUnit} />
          <InputNumber min={0} value={row.reorderQty} onChange={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, reorderQty: v } : r)))} placeholder={t('wh.fields.reorderQty')} addonAfter={data.item.baseUnit} />
        </div>
      ))}
      <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>
    </div>
  );
}

function BarcodesTab({ data, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState(null);
  const add = async (value = code) => {
    if (!value.trim()) return;
    try {
      await whApi.addBarcode(data.item.id, { code: value.trim(), unit });
      setCode('');
      onChanged();
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const remove = async (id) => {
    try {
      await whApi.removeBarcode(id);
      onChanged();
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  return (
    <div className="wh-stack">
      <ul className="wh-list">
        {data.item.barcodes.map((b) => (
          <li key={b.id}>
            <code className="wh-code">{b.code}</code>
            <em>{b.kind}{b.unit ? ` · ${b.unit}` : ''}</em>
            {data.my.canEdit && <Button size="small" type="text" danger onClick={() => remove(b.id)}>✕</Button>}
          </li>
        ))}
        <li>
          <code className="wh-code">{`WI-${data.item.id}`}</code>
          <em>{t('wh.item.ownCode')}</em>
        </li>
      </ul>
      {data.my.canEdit && (
        <div className="wh-subform__row">
          <Input value={code} onChange={(e) => setCode(e.target.value)} onPressEnter={() => add()} placeholder={t('wh.item.barcodePlaceholder')} addonAfter={<ScanButton onScan={(scanned) => add(scanned)} />} />
          {data.item.units.length > 0 && <Select allowClear value={unit} onChange={setUnit} placeholder={t('wh.item.barcodeUnit')} options={data.item.units.map((u) => ({ value: u.code, label: `${u.code} = ${u.factor} ${data.item.baseUnit}` }))} style={{ minWidth: 150 }} />}
          <Button onClick={() => add()} disabled={!code.trim()}>{t('wh.item.addBarcode')}</Button>
        </div>
      )}
    </div>
  );
}

function ToolsList({ data }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  if (!data.instances.length) return <Empty icon="🔧" title={t('wh.tools.none')} />;
  return (
    <ul className="wh-list">
      {data.instances.map((tool) => (
        <li key={tool.id} className="is-click" onClick={() => navigate(`/app/warehouse/tools/${tool.id}`)}>
          <span className="wh-item-cell">
            <strong>{tool.inventoryNo}</strong>
            <em>{[tool.serialNo, t(`wh.instanceStates.${tool.state}`)].filter(Boolean).join(' · ')}</em>
          </span>
          <span className="wh-muted">{tool.where?.label || '—'}</span>
        </li>
      ))}
    </ul>
  );
}

/** The item card over the list (spec §8.1: stock by warehouses, movements, batches and serials, photos, barcodes). */
export default function ItemCard({ id, onClose }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { meta, touch } = useWh();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [labels, setLabels] = useState(null);
  const [tab, setTab] = useState('stock');
  const load = useCallback(() => {
    whApi.item(id).then((res) => { setData(res.data); setError(null); }).catch(setError);
  }, [id]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  const changed = () => {
    load();
    touch();
  };
  const item = data?.item;
  const total = data ? data.stock.filter((s) => !s.holder).reduce((sum, s) => sum + s.qty, 0) : 0;
  const reserved = data ? data.reserves.reduce((sum, r) => sum + r.qty, 0) : 0;
  const archive = () =>
    modal.confirm({
      title: item.archived ? t('wh.item.restoreTitle') : t('wh.item.archiveTitle'),
      content: item.archived ? null : t('wh.item.archiveText'),
      okText: item.archived ? t('wh.item.restore') : t('wh.item.archive'),
      cancelText: t('common.cancel'),
      onOk: () => whApi.archiveItem(item.id, !item.archived).then(changed).catch((err) => message.error(whError(err, t))),
    });
  const more = item
    ? [
        { key: 'labels', label: t('wh.labels.print'), onClick: () => setLabels(item.tracking === 'serial' && data.instances.length ? data.instances.map(toolLabel) : [itemLabel(item)]) },
        meta.rights.canRequestAny && { key: 'issue', label: t('wh.item.issue'), onClick: () => navigate(`/app/warehouse/documents/new/issue?item=${item.id}`) },
        meta.rights.canOperateAny && { key: 'receipt', label: t('wh.item.receipt'), onClick: () => navigate(`/app/warehouse/documents/new/receipt?item=${item.id}`) },
        { key: 'movement', label: t('wh.item.movementReport'), onClick: () => navigate(`/app/warehouse/reports?tab=movement&item=${item.id}`) },
        data.my.canAdmin && { type: 'divider' },
        data.my.canAdmin && { key: 'archive', danger: !item.archived, label: item.archived ? t('wh.item.restore') : t('wh.item.archive'), onClick: archive },
      ].filter(Boolean)
    : [];
  const header = item ? (
    <div className="wh-card__head">
      {item.photoUrl && <img className="wh-card__photo" src={item.photoUrl} alt="" />}
      <div>
        <div className="wh-card__eyebrow">
          {item.sku && <span className="wh-card__no">{item.sku}</span>}
          <span className="wh-flag">{t(`wh.tracking.${item.tracking}`)}</span>
          {item.archived && <span className="wh-flag is-red">{t('wh.item.archived')}</span>}
        </div>
        <h2 className="wh-card__title">{item.name}</h2>
        <div className="wh-card__facts">
          <span><Qty value={total} unit={item.baseUnit} strong /> {t('wh.item.onHandShort')}</span>
          {reserved > 0 && <span>{t('wh.hint.reserved')} {formatQty(reserved, locale)}</span>}
          {item.units.map((u) => <span key={u.code} className="wh-muted">1 {u.code} = {u.factor} {item.baseUnit}</span>)}
          {meta.rights.cost && item.lastPrice !== null && <span className="wh-muted">{t('wh.fields.lastPrice')}: <Money amount={item.lastPrice} /></span>}
        </div>
      </div>
    </div>
  ) : (
    <Skeleton.Input active size="small" />
  );
  const tabs = data
    ? [
        { key: 'stock', label: t('wh.item.tabs.stock'), children: <StockTab data={data} /> },
        { key: 'moves', label: t('wh.item.tabs.moves'), children: <MovesTab data={data} /> },
        item.tracking === 'serial' && { key: 'tools', label: `${t('wh.item.tabs.instances')} · ${data.instances.length}`, children: <ToolsList data={data} /> },
        item.tracking === 'batch' && { key: 'batches', label: t('wh.item.tabs.batches'), children: data.batches.length ? <ul className="wh-list">{data.batches.map((b) => <li key={b.id}><strong>{b.number}</strong><em>{b.expiresOn ? t('wh.item.expires', { date: fmtDate(b.expiresOn) }) : '—'}</em>{b.supplier && <span className="wh-muted">{b.supplier}</span>}</li>)}</ul> : <Empty icon="🏷️" title={t('wh.item.noBatches')} /> },
        { key: 'reserves', label: `${t('wh.item.tabs.reserves')}${data.reserves.length ? ` · ${data.reserves.length}` : ''}`, children: <ReservesTab data={data} onChanged={changed} /> },
        { key: 'barcodes', label: t('wh.item.tabs.barcodes'), children: <BarcodesTab data={data} onChanged={changed} /> },
        { key: 'norms', label: t('wh.item.tabs.norms'), children: <NormsTab key={JSON.stringify(data.norms)} data={data} onChanged={changed} /> },
        { key: 'photos', label: t('wh.item.tabs.photos'), children: <FilesBlock owner="items" ownerId={item.id} files={data.files} canEdit={data.my.canEdit} kind="photo" accept="image/*" onChanged={() => load()} /> },
      ].filter(Boolean)
    : [];
  return (
    <Drawer open onClose={onClose} width={screens.md ? 760 : '100%'} className="wh-card" title={header} destroyOnClose mask={!screens.md}>
      {error ? (
        <Result status="404" title={t('wh.item.notFound')} />
      ) : !data ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          <div className="wh-card__actions">
            {data.my.canEdit && <Button size="large" onClick={() => setEditing(true)}>{t('wh.edit')}</Button>}
            <Button size="large" onClick={() => setLabels([itemLabel(item)])}>{t('wh.labels.print')}</Button>
            <Dropdown menu={{ items: more }} trigger={['click']}>
              <Button size="large" aria-label={t('wh.more')}>⋯</Button>
            </Dropdown>
          </div>
          <Tabs activeKey={tab} onChange={setTab} items={tabs} />
        </>
      )}
      {editing && <ItemForm item={item} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); changed(); }} />}
      <PrintLabelsDialog open={Boolean(labels)} items={labels || []} onClose={() => setLabels(null)} />
    </Drawer>
  );
}
