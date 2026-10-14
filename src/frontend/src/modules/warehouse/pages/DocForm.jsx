import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, AutoComplete, Button, DatePicker, Grid, Input, InputNumber, Result, Select, Skeleton, Steps } from 'antd';
import { CameraOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocale } from '../../../context/LocaleContext';
import BarcodeScanner, { useScannerInput } from '../../../components/ui/BarcodeScanner';
import { dayFromPicker, dayToPicker } from '../../../lib/datetime';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { SIDES, conversionText, formatQty, scanFeedback, unitOptions, whError } from '../lib';
import { BinSelect, FilesBlock, HolderPicker, ItemPicker, Money, SignaturePad, StockHint, TypeTag, WarehouseSelect } from '../components/bits';
import { Route } from './DocumentsPage';
import FreezeBanner from '../components/FreezeBanner';

/** Rights a warehouse side needs, per document type. */
const SIDE_RIGHT = {
  receipt: { to: 'operate' },
  opening: { to: 'admin' },
  supplier_return: { from: 'operate' },
  transfer: { from: 'operate' },
  issue: { from: 'request' },
  return: { to: 'operate' },
  writeoff: { from: 'writeoff' },
  correction: { from: 'admin' },
  inventory: { from: 'inventory' },
};

/** Step 1 «Откуда / Куда». */
function HeaderStep({ type, header, setHeader, existing }) {
  const { t } = useLocale();
  const { meta, can, warehouses } = useWh();
  const [sides] = [SIDES[type] || ['warehouse', 'warehouse']];
  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => {
    if (!meta.modules?.companies || !sides.includes('supplier')) return;
    whApi.lookup('companies', {}).then((res) => setSuppliers(res.data.items)).catch(() => {});
  }, [meta.modules?.companies, sides]);
  const backdate = can('backdate', header.warehouseId || header.toWarehouseId);
  const side = (which) => {
    const kind = sides[which === 'from' ? 0 : 1];
    if (kind === 'warehouse') {
      const field = which === 'from' || type === 'correction' || type === 'inventory' ? 'warehouseId' : 'toWarehouseId';
      const right = SIDE_RIGHT[type]?.[which];
      return (
        <WarehouseSelect
          value={header[field]}
          onChange={(id) => setHeader({ ...header, [field]: id })}
          right={right === 'request' ? undefined : right}
          exclude={type === 'transfer' && which === 'to' ? [header.warehouseId] : []}
          style={{ width: '100%' }}
          size="large"
        />
      );
    }
    if (kind === 'holder') {
      const key = which === 'from' ? 'from' : 'to';
      return <HolderPicker value={header[key]} onChange={(value) => setHeader({ ...header, [key]: value })} types={type === 'handover' ? ['employee'] : ['employee', 'object', 'project']} />;
    }
    if (kind === 'supplier') {
      return <AutoComplete size="large" value={header.supplierName} onChange={(value) => setHeader({ ...header, supplierName: value, supplierCompanyId: null })} onSelect={(_, option) => setHeader({ ...header, supplierName: option.value, supplierCompanyId: option.id })} options={suppliers.map((s) => ({ value: s.label, id: s.id }))} placeholder={t('wh.form.supplierPlaceholder')} filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())} style={{ width: '100%' }} />;
    }
    if (kind === 'expense') return <div className="wh-side-fixed">{t('wh.route.expense')}</div>;
    return <div className="wh-side-fixed">{t('wh.route.inPlace')}</div>;
  };
  const wh = (id) => warehouses.find((w) => w.id === id);
  return (
    <div className="wh-form-step">
      <div className="wh-sides">
        <div className="wh-sides__col">
          <label>{t('wh.form.from')}</label>
          {side('from')}
        </div>
        <div className="wh-sides__arrow" aria-hidden="true">→</div>
        <div className="wh-sides__col">
          <label>{t('wh.form.to')}</label>
          {side('to')}
        </div>
      </div>
      {type === 'transfer' && header.warehouseId && header.toWarehouseId && <p className="wh-muted">{t('wh.form.transferNote', { to: wh(header.toWarehouseId)?.name || '' })}</p>}
      {(type === 'writeoff' || type === 'correction') && (
        <div className="wh-form-grid">
          {type === 'writeoff' && (
            <div>
              <label>{t('wh.fields.reason')}</label>
              <Select size="large" value={header.reason} onChange={(reason) => setHeader({ ...header, reason })} options={meta.enums.reasons.map((value) => ({ value, label: t(`wh.reasons.${value}`) }))} placeholder={t('wh.form.reasonPlaceholder')} style={{ width: '100%' }} />
            </div>
          )}
          <div>
            <label>{t('wh.form.reasonText')}</label>
            <Input size="large" value={header.reasonText} onChange={(e) => setHeader({ ...header, reasonText: e.target.value })} maxLength={1000} placeholder={t('wh.form.reasonTextPlaceholder')} />
          </div>
        </div>
      )}
      {type === 'issue' && (
        <div className="wh-form-grid">
          <div>
            <label>{t('wh.fields.returnBy')}</label>
            <DatePicker value={dayToPicker(header.returnBy)} onChange={(d) => setHeader({ ...header, returnBy: dayFromPicker(d) })} style={{ width: '100%' }} />
            <small className="wh-muted">{t('wh.form.returnByHelp')}</small>
          </div>
        </div>
      )}
      {['receipt', 'opening'].includes(type) && meta.rights.cost && (
        <div className="wh-form-grid">
          <div>
            <label>{t('wh.fields.currency')}</label>
            <Select value={header.currency || meta.settings.currency} onChange={(currency) => setHeader({ ...header, currency, rate: currency === meta.settings.currency ? null : meta.settings.rates?.[currency] || null })} options={meta.settings.currencies.map((code) => ({ value: code, label: code }))} style={{ width: '100%' }} />
          </div>
          {header.currency && header.currency !== meta.settings.currency && (
            <div>
              <label>{t('wh.form.rate', { base: meta.settings.currency, currency: header.currency })}</label>
              <InputNumber min={0} value={header.rate} onChange={(rate) => setHeader({ ...header, rate })} style={{ width: '100%' }} />
            </div>
          )}
        </div>
      )}
      <div className="wh-form-grid">
        {backdate && (
          <div>
            <label>{t('wh.fields.date')}</label>
            <DatePicker showTime value={header.date ? dayjs(header.date) : null} onChange={(d) => setHeader({ ...header, date: d ? d.toISOString() : null })} disabledDate={(d) => d && d.isAfter(dayjs())} placeholder={t('wh.form.now')} style={{ width: '100%' }} />
            <small className="wh-muted">{t('wh.form.backdateHelp')}</small>
          </div>
        )}
        <div>
          <label>{t('wh.fields.comment')}</label>
          <Input value={header.comment} onChange={(e) => setHeader({ ...header, comment: e.target.value })} maxLength={2000} />
        </div>
      </div>
      {existing && <p className="wh-muted">{t('wh.form.headerSaved')}</p>}
    </div>
  );
}

/** One editable line; changes are saved as they are made. */
function LineRow({ doc, line, onChanged, onRemove }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const { meta } = useWh();
  const [qty, setQty] = useState(line.qty);
  const [serials, setSerials] = useState(() => (line.serials || []).map((s) => s.inventoryNo).join('\n'));
  const timer = useRef(null);
  useEffect(() => setQty(line.qty), [line.qty]);
  const save = (patch) =>
    whApi
      .updateLine(doc.id, line.id, patch)
      .then((res) => onChanged(res.data))
      .catch((err) => message.error(whError(err, t)));
  const changeQty = (value) => {
    setQty(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ qty: value ?? 0 }), 450);
  };
  const incoming = ['receipt', 'opening'].includes(doc.type);
  const binWarehouse = ['receipt', 'opening', 'return'].includes(doc.type) ? doc.toWarehouse?.id : doc.warehouse?.id;
  const serialItem = line.item?.tracking === 'serial';
  const batchItem = line.item?.tracking === 'batch';
  return (
    <div className={`wh-line${line.short ? ' is-short' : ''}`}>
      <div className="wh-line__main">
        <span className="wh-item-cell">
          <strong>{line.item?.name || line.nameHint}</strong>
          <em>{[line.item?.sku, line.instance?.inventoryNo, line.reserve ? `${t('wh.lines.byReserve')} ${line.reserve.label}` : null].filter(Boolean).join(' · ')}</em>
          {line.hint && <StockHint hint={line.hint} unit={line.item?.baseUnit} short={line.short} />}
          {conversionText(line, locale) && <small className="wh-conv">{conversionText(line, locale)}</small>}
        </span>
        <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove} aria-label={t('common.delete')} />
      </div>
      {!line.item && <ItemPicker onPick={(item) => save({ itemId: item.id, unit: item.receiptUnit || item.baseUnit })} placeholder={t('wh.lines.pickItem')} />}
      <div className="wh-line__fields">
        <InputNumber min={doc.type === 'correction' ? undefined : 0} value={qty} onChange={changeQty} size="large" disabled={Boolean(line.instance)} className="wh-line__qty" />
        {line.item && !serialItem && <Select value={line.unit} onChange={(unit) => save({ unit })} options={unitOptions(line.item)} size="large" style={{ minWidth: 90 }} popupMatchSelectWidth={false} />}
        {serialItem && <span className="wh-muted">{line.item.baseUnit}</span>}
        {incoming && meta.rights.cost && <InputNumber min={0} defaultValue={line.price ?? undefined} onBlur={(e) => e.target.value !== '' && save({ price: e.target.value })} placeholder={t('wh.fields.price')} size="large" addonAfter={doc.currency || meta.settings.currency} style={{ width: 170 }} />}
        {incoming && !meta.rights.cost && (line.priced ? <span className="wh-flag is-green">{t('wh.lines.priced')}</span> : <InputNumber min={0} onBlur={(e) => e.target.value !== '' && save({ price: e.target.value })} placeholder={t('wh.lines.priceWriteOnly')} size="large" style={{ width: 190 }} />)}
        {binWarehouse && <BinSelect warehouseId={binWarehouse} value={incoming || doc.type === 'return' ? line.toBin?.id : line.bin?.id} onChange={(bin) => save(incoming || doc.type === 'return' ? { toBinId: bin } : { binId: bin })} size="large" />}
      </div>
      {incoming && batchItem && (
        <div className="wh-line__fields">
          <Input defaultValue={line.batchNumber} onBlur={(e) => save({ batchNumber: e.target.value })} placeholder={t('wh.lines.batchNumber')} style={{ maxWidth: 200 }} />
          {line.item.trackExpiry && <DatePicker value={dayToPicker(line.expiresOn)} onChange={(d) => save({ expiresOn: dayFromPicker(d) })} placeholder={t('wh.lines.expiresOn')} />}
        </div>
      )}
      {incoming && serialItem && (
        <div className="wh-line__serials">
          <Input.TextArea value={serials} onChange={(e) => setSerials(e.target.value)} onBlur={() => save({ serials: serials.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).map((inventoryNo) => ({ inventoryNo })) })} autoSize={{ minRows: 1, maxRows: 6 }} placeholder={t('wh.lines.serialsPlaceholder', { n: formatQty(line.qty, locale) })} />
        </div>
      )}
    </div>
  );
}

/** Step 2 «Позиции»: scan, search, «как в прошлый раз». */
function LinesStep({ data, onChanged }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [scanning, setScanning] = useState(false);
  const [copying, setCopying] = useState(false);
  const doc = data.document;
  const add = useCallback(
    async (payload, { silent } = {}) => {
      try {
        const res = await whApi.addLine(doc.id, payload);
        onChanged(res.data);
        scanFeedback(true);
        if (!silent) message.success({ content: t('wh.lines.added'), duration: 1 });
      } catch (err) {
        scanFeedback(false);
        message.error(whError(err, t));
      }
    },
    [doc.id, onChanged, message, t]
  );
  const onScan = useCallback((code) => add({ code }, { silent: false }), [add]);
  // USB / Bluetooth scanners type like a keyboard: every scan adds 1 (or the pack).
  useScannerInput(onScan, { enabled: !scanning });
  const remove = (line) =>
    whApi
      .deleteLine(doc.id, line.id)
      .then((res) => onChanged(res.data))
      .catch((err) => message.error(whError(err, t)));
  const copyLast = async () => {
    setCopying(true);
    try {
      const list = await whApi.documents({ type: doc.type, status: 'posted', warehouse: doc.warehouse?.id || doc.toWarehouse?.id, pageSize: 5 });
      const last = list.data.items.find((d) => d.id !== doc.id);
      if (!last) {
        message.info(t('wh.lines.noPrevious'));
        return;
      }
      const card = await whApi.document(last.id);
      let next = null;
      for (const line of card.data.lines.filter((l) => l.item && !l.instance)) {
        const res = await whApi.addLine(doc.id, { itemId: line.item.id, qty: line.qty, unit: line.unit, merge: true });
        next = res.data;
      }
      if (next) onChanged(next);
      message.success(t('wh.lines.copied', { number: last.number }));
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setCopying(false);
    }
  };
  return (
    <div className="wh-form-step">
      <div className="wh-addbar">
        <Button type="primary" size="large" icon={<CameraOutlined />} onClick={() => setScanning(true)}>{t('wh.lines.scan')}</Button>
        <div className="wh-addbar__search">
          <ItemPicker onPick={(item) => add({ itemId: item.id }, { silent: true })} size="large" />
        </div>
        <Button size="large" icon={<CopyOutlined />} loading={copying} onClick={copyLast}>{t('wh.lines.likeLastTime')}</Button>
      </div>
      <p className="wh-muted wh-addbar__hint">{t('wh.lines.scanHint')}</p>
      {data.lines.length ? (
        <div className="wh-lines">
          {data.lines.map((line) => (
            <LineRow key={line.id} doc={doc} line={line} onChanged={onChanged} onRemove={() => remove(line)} />
          ))}
        </div>
      ) : (
        <div className="wh-empty is-small">
          <span className="wh-empty__icon">📷</span>
          <strong>{t('wh.lines.empty')}</strong>
          <p>{t('wh.lines.emptyText')}</p>
        </div>
      )}
      <BarcodeScanner open={scanning} continuous onScan={onScan} onClose={() => setScanning(false)} title={t('wh.lines.scan')} hint={t('wh.lines.scanCameraHint')} />
    </div>
  );
}

/** Step 3 «Провести»: summary, attachments, signature, the action. */
function FinishStep({ data, onChanged, onAction, busy }) {
  const { t } = useLocale();
  const { meta } = useWh();
  const doc = data.document;
  const my = data.my;
  const signed = data.files.some((f) => f.kind === 'signature');
  const [signing, setSigning] = useState(false);
  const sign = async (image, name) => {
    setSigning(true);
    try {
      const res = await whApi.sign(doc.id, image, name);
      onChanged(res.data);
    } finally {
      setSigning(false);
    }
  };
  const missing = data.lines.some((l) => !l.item);
  return (
    <div className="wh-form-step">
      <div className="wh-summary">
        <TypeTag type={doc.type} />
        <Route doc={doc} />
        <span>{t('wh.docs.linesN', { n: data.lines.length })}</span>
        {doc.sum !== null && doc.sum !== undefined && <Money amount={doc.sum} strong />}
      </div>
      {my.shortages && <div className="wh-banner is-red">{t('wh.card.shortage')}</div>}
      {missing && <div className="wh-banner is-amber">{t('wh.form.pickMissing')}</div>}
      {doc.type === 'writeoff' && meta.settings.approvalTypes?.includes('writeoff') && (
        <div className="wh-banner">{t('wh.form.approvalNote', { amount: meta.settings.approvalThreshold, currency: meta.settings.approvalThresholdCurrency })}</div>
      )}
      <section className="wh-finish">
        <h3>{t('wh.form.attachments')}</h3>
        <p className="wh-muted">{t('wh.form.attachmentsHelp')}</p>
        <FilesBlock owner="documents" ownerId={doc.id} files={data.files.filter((f) => f.kind !== 'signature')} kinds={['waybill', 'photo', 'act', 'invoice', 'other']} onChanged={() => onChanged()} />
      </section>
      {my.sign && (
        <section className="wh-finish">
          <h3>{t('wh.sign.title')}</h3>
          {signed ? <div className="wh-banner is-green">{t('wh.sign.done')}</div> : <SignaturePad onSave={sign} busy={signing} />}
        </section>
      )}
      <div className="wh-finish__actions">
        {my.post && <Button type="primary" size="large" loading={busy === 'post'} disabled={missing} onClick={() => onAction('post')}>{t('wh.actions.post')}</Button>}
        {my.ship && <Button type="primary" size="large" loading={busy === 'ship'} disabled={missing} onClick={() => onAction('ship')}>{t('wh.actions.ship')}</Button>}
        {my.request && <Button type="primary" size="large" loading={busy === 'request'} disabled={missing} onClick={() => onAction('request')}>{t('wh.actions.request')}</Button>}
        <Button size="large" onClick={() => onAction('close')}>{t('wh.form.saveDraft')}</Button>
      </div>
    </div>
  );
}

/** A document in three steps (spec §2): «Откуда / Куда» → positions → «Провести». */
export default function DocForm() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { meta, touch } = useWh();
  const { type: newType, id } = useParams();
  const [search] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(id ? Number(search.get('step') || 1) : 0);
  const [busy, setBusy] = useState(null);
  const [requests, setRequests] = useState([]);
  const type = data?.document?.type || newType;
  const [header, setHeader] = useState(() => ({
    warehouseId: search.get('warehouse') ? Number(search.get('warehouse')) : null,
    toWarehouseId: null,
    from: null,
    to: null,
    supplierName: '',
    supplierCompanyId: null,
    reason: null,
    reasonText: '',
    comment: '',
    returnBy: null,
    date: null,
    currency: null,
    rate: null,
  }));
  const load = useCallback(async () => {
    try {
      const res = await whApi.document(id);
      setData(res.data);
      const d = res.data.document;
      setHeader({ warehouseId: d.warehouse?.id || null, toWarehouseId: d.toWarehouse?.id || null, from: d.from, to: d.to, supplierName: d.supplier?.name || '', supplierCompanyId: d.supplier?.companyId || null, reason: d.reason, reasonText: d.reasonText, comment: d.comment, returnBy: d.returnBy, date: null, currency: d.currency, rate: d.rate });
    } catch (err) {
      setError(err);
    }
  }, [id]);
  useEffect(() => {
    if (id) load();
  }, [id, load]);
  // Default warehouse: the only one where the person can act.
  useEffect(() => {
    if (id || !meta) return;
    const right = SIDE_RIGHT[newType] || {};
    const field = right.to && !right.from ? 'toWarehouseId' : 'warehouseId';
    const need = right.to || right.from;
    const options = meta.warehouses.filter((w) => !w.archived && (need === 'request' || !need ? true : (w.rights || []).includes(need)));
    // One choice, or the warehouse the person is the MOL of.
    const mine = options.filter((w) => (meta.rights.mol || []).includes(w.id));
    const pick = options.length === 1 ? options[0] : mine.length === 1 ? mine[0] : null;
    if (pick && !header[field]) setHeader((h) => ({ ...h, [field]: pick.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, newType, id]);
  useEffect(() => {
    if (id || newType !== 'receipt' || !meta?.modules?.procurement) return;
    whApi.lookup('requests', {}).then((res) => setRequests(res.data.items)).catch(() => setRequests([]));
  }, [id, newType, meta?.modules?.procurement]);
  const payload = useMemo(
    () => ({
      warehouseId: header.warehouseId,
      toWarehouseId: header.toWarehouseId,
      fromHolderType: header.from?.type || null,
      fromHolderId: header.from?.id || null,
      toHolderType: header.to?.type || null,
      toHolderId: header.to?.id || null,
      supplierName: header.supplierName || null,
      supplierCompanyId: header.supplierCompanyId,
      reason: header.reason,
      reasonText: header.reasonText || null,
      comment: header.comment || null,
      returnBy: header.returnBy,
      currency: header.currency || undefined,
      rate: header.rate || undefined,
      ...(header.date ? { date: header.date } : {}),
    }),
    [header]
  );
  const ready = useMemo(() => {
    const sides = SIDES[type] || [];
    const okSide = (kind, which) => {
      if (kind === 'warehouse') return Boolean(which === 'from' || type === 'correction' ? header.warehouseId : header.toWarehouseId);
      if (kind === 'holder') return Boolean(header[which]?.id);
      return true;
    };
    return okSide(sides[0], 'from') && okSide(sides[1], 'to') && (type !== 'writeoff' || header.reason || header.reasonText) && (type !== 'correction' || header.reasonText);
  }, [type, header]);
  const next = async () => {
    setBusy('next');
    try {
      if (!id) {
        const res = await whApi.createDocument({ type: newType, ...payload });
        const docId = res.data.document.id;
        const itemId = search.get('item');
        if (itemId) await whApi.addLine(docId, { itemId: Number(itemId) }).catch(() => {});
        navigate(`/app/warehouse/documents/${docId}/edit?step=1`, { replace: true });
      } else {
        const res = await whApi.updateDocument(id, payload);
        setData(res.data);
        setStep(1);
      }
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(null);
    }
  };
  const fromRequest = async (requestId) => {
    if (!header.toWarehouseId) {
      message.warning(t('wh.form.pickWarehouseFirst'));
      return;
    }
    setBusy('request');
    try {
      const res = await whApi.fromProcurement({ requestId, warehouseId: header.toWarehouseId });
      navigate(`/app/warehouse/documents/${res.data.document.id}/edit?step=1`, { replace: true });
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(null);
    }
  };
  const action = async (name) => {
    if (name === 'close') {
      touch();
      navigate(`/app/warehouse/documents/${id}`);
      return;
    }
    setBusy(name);
    try {
      const res = await whApi.action(id, name);
      const status = res.data.document.status;
      message.success(t(status === 'pending' ? 'wh.done.toApproval' : `wh.done.${name === 'post' ? 'posted' : name === 'ship' ? 'shipped' : 'requested'}`));
      touch();
      navigate(`/app/warehouse/documents/${id}`);
    } catch (err) {
      message.error(whError(err, t));
      load();
    } finally {
      setBusy(null);
    }
  };
  if (error) return <Result status={error?.response?.status === 404 ? '404' : 'warning'} title={whError(error, t)} />;
  if (id && !data) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (data && !['draft', 'requested'].includes(data.document.status)) {
    return <Result status="info" title={t('wh.form.notEditable')} extra={<Button onClick={() => navigate(`/app/warehouse/documents/${id}`)}>{t('wh.form.openCard')}</Button>} />;
  }
  const steps = [{ title: t('wh.form.step1') }, { title: t('wh.form.step2') }, { title: t('wh.form.step3') }];
  return (
    <div className="wh-page wh-docform">
      <header className="wh-docform__head">
        <TypeTag type={type} compact />
        <h1>{data ? `${t(`wh.types.${type}`)} ${data.document.number}` : t(`wh.form.new.${type}`)}</h1>
        <span className="mod-toolbar__grow" />
        <Button onClick={() => navigate(id ? `/app/warehouse/documents/${id}` : '/app/warehouse/documents')}>{t('wh.form.close')}</Button>
      </header>
      <FreezeBanner warehouseId={header.warehouseId || header.toWarehouseId} />
      <Steps current={step} items={steps} onChange={(s) => (id ? setStep(s) : null)} responsive={false} size="small" labelPlacement={screens.md ? 'horizontal' : 'vertical'} className="wh-steps" />
      {step === 0 && (
        <>
          {!id && newType === 'receipt' && requests.length > 0 && (
            <div className="wh-from-request">
              <strong>{t('wh.form.fromRequest')}</strong>
              <p className="wh-muted">{t('wh.form.fromRequestHelp')}</p>
              <Select showSearch optionFilterProp="label" placeholder={t('wh.form.pickRequest')} onChange={fromRequest} loading={busy === 'request'} options={requests.map((r) => ({ value: r.id, label: `${r.label}${r.supplier ? ` · ${r.supplier}` : ''}${r.deliveryState === 'partial' ? ` · ${t('wh.form.partlyDelivered')}` : ''}` }))} style={{ width: '100%' }} size="large" />
            </div>
          )}
          <HeaderStep type={type} header={header} setHeader={setHeader} existing={Boolean(id)} />
          <div className="wh-form-nav">
            <Button type="primary" size="large" disabled={!ready} loading={busy === 'next'} onClick={next}>{t('wh.form.next')}</Button>
          </div>
        </>
      )}
      {step === 1 && data && (
        <>
          <LinesStep data={data} onChanged={(nextData) => (nextData?.document ? setData(nextData) : load())} />
          <div className="wh-form-nav">
            <Button size="large" onClick={() => setStep(0)}>{t('wh.form.back')}</Button>
            <Button type="primary" size="large" disabled={!data.lines.length} onClick={() => setStep(2)}>{t('wh.form.next')}</Button>
          </div>
        </>
      )}
      {step === 2 && data && (
        <>
          <FinishStep data={data} onChanged={(nextData) => (nextData?.document ? setData(nextData) : load())} onAction={action} busy={busy} />
          <div className="wh-form-nav">
            <Button size="large" onClick={() => setStep(1)}>{t('wh.form.back')}</Button>
          </div>
        </>
      )}
    </div>
  );
}
