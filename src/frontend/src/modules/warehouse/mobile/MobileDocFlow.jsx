import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, AutoComplete, Button, DatePicker, Result, Skeleton, Switch } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { dayFromPicker, dayToPicker } from '../../../lib/datetime';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { conversionText, formatQty, readStore, scanFeedback, whError, writeStore } from '../lib';
import { HolderPicker, SignaturePad, TypeTag, WarehouseSelect } from '../components/bits';
import FreezeBanner from '../components/FreezeBanner';
import { BottomBar, HintLine, MobileTop, PhotoButton, QtySheet, ScanBar, StepDots, SuccessScreen, WarehouseChip, useMobileWarehouse, useResolver } from './parts';

const QUICK_KEY = 'wh.m.quick';

/** Which warehouse field the chosen warehouse fills, per flow. */
const SIDE = { receipt: 'toWarehouseId', issue: 'warehouseId', transfer: 'warehouseId' };
const RIGHT = { receipt: 'operate', issue: 'request', transfer: 'operate' };

/** The default unit of a scanned item in a flow: the pack scanned, the unit already in the line, the item's unit for the flow. */
function defaultUnit(type, item, scannedUnit, lines) {
  if (scannedUnit && scannedUnit !== item.baseUnit) return scannedUnit;
  const line = lines.find((l) => l.item?.id === item.id && !l.instance);
  if (line) return line.unit;
  if (type === 'receipt') return item.receiptUnit || item.baseUnit;
  return item.issueUnit || item.baseUnit;
}

/** Step 1: from / to. */
function HeaderStep({ type, warehouse, list, onWarehouse, header, setHeader, onFromRequest, busy }) {
  const { t } = useLocale();
  const { meta } = useWh();
  const [suppliers, setSuppliers] = useState([]);
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (type !== 'receipt') return;
    if (meta.modules?.companies) whApi.lookup('companies', {}).then((res) => setSuppliers(res.data.items)).catch(() => {});
    if (meta.modules?.procurement) whApi.lookup('requests', {}).then((res) => setRequests(res.data.items)).catch(() => {});
  }, [type, meta.modules?.companies, meta.modules?.procurement]);
  const right = RIGHT[type];
  return (
    <div className="whm-stack">
      <section className="whm-card">
        <label className="whm-label">{type === 'receipt' ? t('whm.flow.toWarehouse') : t('whm.flow.fromWarehouse')}</label>
        <WarehouseChip warehouse={warehouse} list={list} onChange={onWarehouse} filter={(w) => (right === 'request' ? (w.rights || []).some((r) => r === 'request' || r === 'operate') : (w.rights || []).includes(right))} />
      </section>
      {type === 'receipt' && requests.length > 0 && (
        <section className="whm-card">
          <label className="whm-label">{t('wh.form.fromRequest')}</label>
          <p className="whm-muted">{t('whm.flow.fromRequestHelp')}</p>
          <div className="whm-list">
            {requests.slice(0, 8).map((r) => (
              <button key={r.id} type="button" className="whm-row" disabled={busy} onClick={() => onFromRequest(r)} data-testid={`request-${r.id}`}>
                <span className="whm-row__main">
                  <strong>{r.label}</strong>
                  <em>{[r.supplier, r.deliveryState === 'partial' ? t('wh.form.partlyDelivered') : null].filter(Boolean).join(' · ')}</em>
                </span>
                <RightOutlined />
              </button>
            ))}
          </div>
        </section>
      )}
      {type === 'receipt' && (
        <section className="whm-card">
          <label className="whm-label" htmlFor="whm-supplier">{t('whm.flow.supplier')}</label>
          <AutoComplete
            id="whm-supplier"
            size="large"
            value={header.supplierName}
            onChange={(value) => setHeader({ ...header, supplierName: value, supplierCompanyId: null })}
            onSelect={(_, option) => setHeader({ ...header, supplierName: option.value, supplierCompanyId: option.id })}
            options={suppliers.map((s) => ({ value: s.label, id: s.id }))}
            placeholder={t('wh.form.supplierPlaceholder')}
            filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
            style={{ width: '100%' }}
          />
        </section>
      )}
      {type === 'issue' && (
        <section className="whm-card">
          <label className="whm-label">{t('whm.flow.recipient')}</label>
          <HolderPicker value={header.to} onChange={(to) => setHeader({ ...header, to })} />
          <label className="whm-label">{t('wh.fields.returnBy')}</label>
          <DatePicker size="large" value={dayToPicker(header.returnBy)} onChange={(d) => setHeader({ ...header, returnBy: dayFromPicker(d) })} style={{ width: '100%' }} inputReadOnly />
        </section>
      )}
      {type === 'transfer' && (
        <section className="whm-card">
          <label className="whm-label">{t('whm.flow.toWarehouse')}</label>
          <WarehouseSelect size="large" value={header.toWarehouseId} onChange={(toWarehouseId) => setHeader({ ...header, toWarehouseId })} exclude={[warehouse?.id]} style={{ width: '100%' }} />
          {header.toWarehouseId && <p className="whm-muted">{t('wh.form.transferNote', { to: list.find((w) => w.id === header.toWarehouseId)?.name || '' })}</p>}
        </section>
      )}
    </div>
  );
}

/** One line of the running list: tap to change the quantity. */
function LineCard({ line, onOpen, type }) {
  const { t, locale } = useLocale();
  const conv = conversionText(line, locale);
  return (
    <button type="button" className={`whm-line${line.short ? ' is-short' : ''}${!line.qty ? ' is-zero' : ''}`} onClick={onOpen} data-testid="whm-line">
      <span className="whm-line__main">
        <strong>{line.item?.name || line.nameHint}</strong>
        <em>{[line.item?.sku, line.instance?.inventoryNo, line.bin?.path, line.toBin ? `→ ${line.toBin.path}` : null].filter(Boolean).join(' · ')}</em>
        {type !== 'receipt' && line.hint && <HintLine hint={line.hint} unit={line.item?.baseUnit} short={line.short} />}
        {!line.item && <em className="wh-red">{t('wh.lines.pickItem')}</em>}
      </span>
      <span className="whm-line__qty">
        <strong>{formatQty(line.qty, locale)}</strong>
        <small>{line.unit}</small>
        {conv && <em>{conv}</em>}
      </span>
    </button>
  );
}

/**
 * /app/warehouse/m/doc/:type[/:id] — receipt, issue or transfer in three
 * steps (spec §2): «Откуда / Куда» → positions by scanning → «Провести».
 */
export default function MobileDocFlow() {
  const { type, id } = useParams();
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { meta, touch } = useWh();
  const [warehouse, setWarehouse, list] = useMobileWarehouse();
  const [step, setStep] = useState(id ? 1 : 0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [header, setHeader] = useState({ supplierName: '', supplierCompanyId: null, to: null, returnBy: null, toWarehouseId: null });
  const [sheet, setSheet] = useState(null); // { item, qty, unit, lineId?, batchId?, instanceId?, title }
  const [quick, setQuick] = useState(() => readStore(QUICK_KEY, false));
  const [bin, setBin] = useState(null); // { id, path }: scanned bin for the next lines
  const [camera, setCamera] = useState(false);
  const [result, setResult] = useState(null);
  const [byFact, setByFact] = useState(false);
  const docWarehouse = data ? (type === 'receipt' ? data.document.toWarehouse?.id : data.document.warehouse?.id) : warehouse?.id;
  const resolve = useResolver(docWarehouse);
  const sheetRef = useRef(null);
  sheetRef.current = sheet;

  const load = useCallback(async () => {
    try {
      const res = await whApi.document(id);
      setData(res.data);
    } catch (err) {
      setError(err);
    }
  }, [id]);
  useEffect(() => {
    if (id) load();
    else {
      setData(null);
      setStep(0);
      setResult(null);
    }
  }, [id, load]);

  const ready = type === 'receipt' ? Boolean(warehouse) : type === 'issue' ? Boolean(warehouse && header.to?.id) : Boolean(warehouse && header.toWarehouseId);

  const create = async () => {
    setBusy('create');
    try {
      const payload = { type, [SIDE[type]]: warehouse.id };
      if (type === 'receipt') Object.assign(payload, { supplierName: header.supplierName || null, supplierCompanyId: header.supplierCompanyId });
      if (type === 'issue') Object.assign(payload, { toHolderType: header.to.type, toHolderId: header.to.id, returnBy: header.returnBy });
      if (type === 'transfer') payload.toWarehouseId = header.toWarehouseId;
      const res = await whApi.createDocument(payload);
      navigate(`/app/warehouse/m/doc/${type}/${res.data.document.id}`, { replace: true });
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(null);
    }
  };
  const fromRequest = async (request) => {
    setBusy('request');
    try {
      const res = await whApi.fromProcurement({ requestId: request.id, warehouseId: warehouse.id });
      navigate(`/app/warehouse/m/doc/receipt/${res.data.document.id}`, { replace: true });
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(null);
    }
  };

  const doc = data?.document;
  const lines = useMemo(() => data?.lines || [], [data]);
  const editable = doc && ['draft', 'requested'].includes(doc.status);

  const addLine = useCallback(
    async (payload) => {
      try {
        const binField = type === 'receipt' ? 'toBinId' : 'binId';
        const binOf = (l) => (type === 'receipt' ? l.toBin : l.bin)?.id || null;
        // A line from the purchase request (or emptied «by fact») takes the scan, so the delivery stays linked to the request.
        const target = !payload.instanceId && !payload.batchId && lines.find((l) => l.item?.id === payload.itemId && l.unit === payload.unit && !l.instance && (l.procItemId || !Number(l.qty)) && (!bin || !Number(l.qty) || binOf(l) === bin.id));
        const res = target
          ? await whApi.updateLine(doc.id, target.id, { qty: Math.round((Number(target.qty) + Number(payload.qty || 1)) * 1e4) / 1e4, ...(bin ? { [binField]: bin.id } : {}) })
          : await whApi.addLine(doc.id, { ...payload, ...(bin ? { [binField]: bin.id } : {}) });
        if (target) res.data.lineId = target.id;
        setData(res.data);
        scanFeedback(true);
        const line = res.data.lines.find((l) => l.id === res.data.lineId);
        if (line?.short) message.warning({ content: t('whm.flow.short', { name: line.item?.name || '' }), key: 'whm-short' });
        return true;
      } catch (err) {
        scanFeedback(false);
        message.error(whError(err, t));
        return false;
      }
    },
    [doc?.id, bin, type, lines, message, t]
  );

  const commitSheet = useCallback(async () => {
    const s = sheetRef.current;
    if (!s) return;
    const qty = Number(s.qty);
    if (s.lineId) {
      setBusy('sheet');
      try {
        const res = await whApi.updateLine(doc.id, s.lineId, { qty, unit: s.unit });
        setData(res.data);
      } catch (err) {
        message.error(whError(err, t));
      } finally {
        setBusy(null);
      }
    } else if (qty > 0) {
      setBusy('sheet');
      await addLine({ itemId: s.item.id, qty, unit: s.unit, batchId: s.batchId, instanceId: s.instanceId });
      setBusy(null);
    }
    setSheet(null);
  }, [doc?.id, addLine, message, t]);

  const onCode = useCallback(
    async (code) => {
      if (!editable) return;
      const found = await resolve(code);
      if (!found) return;
      if (found.kind === 'bin') {
        setBin({ id: found.bin.id, path: found.bin.path });
        scanFeedback(true);
        message.info({ content: t('whm.flow.binSet', { bin: found.bin.path }), key: 'whm-bin' });
        return;
      }
      if (found.kind === 'ambiguous') {
        message.warning(t('whm.scan.ambiguous'));
        return;
      }
      if (!found.item) {
        scanFeedback(false);
        message.warning({ content: t('whm.scan.notItem'), key: 'whm-scan' });
        return;
      }
      if (found.instance) {
        await addLine({ itemId: found.item.id, instanceId: found.instance.id });
        return;
      }
      const current = sheetRef.current;
      // A repeat scan of the item in the open sheet adds one.
      if (current && !current.lineId && current.item.id === found.item.id) {
        scanFeedback(true);
        setSheet({ ...current, qty: (Number(current.qty) || 0) + 1 });
        return;
      }
      if (current) await commitSheet();
      const unit = defaultUnit(type, found.item, found.unit, lines);
      if (quick) {
        await addLine({ itemId: found.item.id, qty: 1, unit, batchId: found.batch?.id });
        return;
      }
      scanFeedback(true);
      setSheet({ item: found.item, qty: 1, unit, batchId: found.batch?.id, title: t('whm.qty.scanned') });
    },
    [editable, resolve, addLine, commitSheet, quick, type, lines, message, t]
  );
  const pickItem = (item) => setSheet({ item, qty: 1, unit: defaultUnit(type, item, null, lines), title: t('whm.qty.found') });
  const openLine = (line) => line.item && setSheet({ item: line.item, qty: line.qty, unit: line.unit, lineId: line.id, title: t('whm.qty.edit') });
  const removeLine = async () => {
    const s = sheetRef.current;
    try {
      const res = await whApi.deleteLine(doc.id, s.lineId);
      setData(res.data);
    } catch (err) {
      message.error(whError(err, t));
    }
    setSheet(null);
  };
  const countByFact = async () => {
    setBusy('fact');
    try {
      let next = data;
      for (const line of lines) {
        const res = await whApi.updateLine(doc.id, line.id, { qty: 0 });
        next = res.data;
      }
      setData(next);
      setByFact(true);
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(null);
    }
  };

  const post = async () => {
    const action = type === 'transfer' ? 'ship' : 'post';
    setBusy('post');
    try {
      // Lines that did not arrive (zero after «по факту») leave the document.
      for (const line of lines.filter((l) => !Number(l.qty))) await whApi.deleteLine(doc.id, line.id);
      const res = await whApi.action(doc.id, action);
      setResult(res.data.document);
      setStep(3);
      touch();
    } catch (err) {
      message.error(whError(err, t));
      load();
    } finally {
      setBusy(null);
    }
  };
  const orderShortage = async () => {
    try {
      const res = await whApi.orderShortage(doc.id);
      message.success(t('wh.done.ordered', { number: res.data.request.number }));
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const sign = async (image, name) => {
    setBusy('sign');
    try {
      const res = await whApi.sign(doc.id, image, name);
      setData(res.data);
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(null);
    }
  };

  const title = t(`whm.flow.title.${type}`);
  const labels = [t('wh.form.step1'), t('wh.form.step2'), t('wh.form.step3')];
  if (!['receipt', 'issue', 'transfer'].includes(type)) return <Result status="404" />;
  if (error) return <Result status="warning" title={whError(error, t)} extra={<Button onClick={() => navigate('/app/warehouse/m')}>{t('whm.toHome')}</Button>} />;
  if (id && !data) return <div className="whm-page"><Skeleton active paragraph={{ rows: 8 }} /></div>;

  if (step === 3 && result) {
    const pending = result.status === 'pending';
    const shipped = result.status === 'shipped';
    return (
      <div className="whm-page">
        <SuccessScreen tone={pending ? 'amber' : 'green'} icon={pending ? '⏳' : '✓'} title={t(pending ? 'whm.done.pending' : shipped ? 'whm.done.shipped' : `whm.done.${type}`, { number: result.number })} text={t('whm.done.lines', { n: lines.filter((l) => Number(l.qty)).length })}>
          <Button type="primary" size="large" block onClick={() => navigate(`/app/warehouse/m/doc/${type}`, { replace: true })}>{t(`whm.done.again.${type}`)}</Button>
          <Button size="large" block onClick={() => navigate('/app/warehouse/m')}>{t('whm.toHome')}</Button>
          <Button type="link" onClick={() => navigate(`/app/warehouse/documents/${result.id}`)}>{t('whm.done.open')}</Button>
        </SuccessScreen>
      </div>
    );
  }
  if (doc && !editable) {
    return (
      <div className="whm-page">
        <MobileTop title={`${title} ${doc.number}`} />
        <Result status="info" title={t('wh.form.notEditable')} extra={<Button onClick={() => navigate(`/app/warehouse/documents/${doc.id}`)}>{t('wh.form.openCard')}</Button>} />
      </div>
    );
  }

  const totalLines = lines.length;
  const zero = lines.filter((l) => !Number(l.qty));
  const shortages = data?.my?.shortages;
  const signed = data?.files?.some((f) => f.kind === 'signature');

  return (
    <div className={`whm-page whm-flow is-${type}`}>
      <MobileTop title={doc ? `${title} · ${doc.number}` : title} sub={doc ? [doc.warehouse?.name, doc.toWarehouse?.name, doc.to?.label].filter(Boolean).join(' → ') : warehouse?.name} onBack={() => (step > 1 ? setStep(step - 1) : navigate('/app/warehouse/m'))} />
      <StepDots step={step} labels={labels} />
      <FreezeBanner warehouseId={docWarehouse} compact />
      {step === 0 && (
        <>
          <HeaderStep type={type} warehouse={warehouse} list={list} onWarehouse={setWarehouse} header={header} setHeader={setHeader} onFromRequest={fromRequest} busy={Boolean(busy)} />
          <BottomBar>
            <Button type="primary" size="large" block disabled={!ready} loading={busy === 'create'} onClick={create}>{t('wh.form.next')}</Button>
          </BottomBar>
        </>
      )}
      {step === 1 && doc && (
        <>
          <ScanBar onCode={onCode} onPickItem={pickItem} title={title} hint={t('whm.scan.hint')} cameraOpen={camera} setCameraOpen={setCamera} />
          <div className="whm-toolrow">
            <label className="whm-toggle">
              <Switch size="small" checked={quick} onChange={(v) => { setQuick(v); writeStore(QUICK_KEY, v); }} />
              <span>{t('whm.flow.quick')}</span>
            </label>
            {bin ? (
              <button type="button" className="whm-pill" onClick={() => setBin(null)} aria-label={t('whm.flow.clearBin')}>
                {t('whm.flow.bin')}: <strong>{bin.path}</strong> ✕
              </button>
            ) : (
              (type === 'receipt' ? doc.toWarehouse?.binsEnabled : doc.warehouse?.binsEnabled) && <span className="whm-muted">{t('whm.flow.scanBin')}</span>
            )}
          </div>
          {doc.procurement && !byFact && lines.some((l) => Number(l.qty)) && (
            <div className="wh-banner whm-banner">
              <span>{t('whm.flow.fromRequestLines', { label: doc.procurement.label })}</span>
              <Button size="small" loading={busy === 'fact'} onClick={countByFact}>{t('whm.flow.byFact')}</Button>
            </div>
          )}
          {shortages && (
            <div className="wh-banner is-red whm-banner">
              <span>{t('wh.card.shortage')}</span>
              {meta.modules?.procurement && <Button size="small" onClick={orderShortage}>{t('wh.actions.orderShortage')}</Button>}
            </div>
          )}
          {totalLines ? (
            <div className="whm-lines" aria-live="polite">
              {lines.map((line) => (
                <LineCard key={line.id} line={line} type={type} onOpen={() => openLine(line)} />
              ))}
            </div>
          ) : (
            <div className="whm-empty">
              <span aria-hidden="true">📷</span>
              <strong>{t('whm.flow.emptyTitle')}</strong>
              <p>{t('whm.flow.emptyText')}</p>
            </div>
          )}
          <BottomBar>
            <span className="whm-bottom__count">{t('whm.flow.positions', { n: totalLines })}</span>
            <Button type="primary" size="large" disabled={!totalLines || lines.every((l) => !Number(l.qty))} onClick={() => setStep(2)}>{t('wh.form.next')}</Button>
          </BottomBar>
        </>
      )}
      {step === 2 && doc && (
        <>
          <section className="whm-card whm-summary">
            <TypeTag type={type} />
            <strong>{doc.number}</strong>
            <span>{[doc.warehouse?.name || doc.supplier?.name, doc.toWarehouse?.name || doc.to?.label].filter(Boolean).join(' → ')}</span>
            <span>{t('whm.flow.positions', { n: totalLines - zero.length })}</span>
            <ul className="whm-summary__list">
              {lines.filter((l) => Number(l.qty)).slice(0, 12).map((l) => (
                <li key={l.id}>
                  <span>{l.item?.name}</span>
                  <strong>{formatQty(l.qty, locale)} {l.unit}</strong>
                </li>
              ))}
            </ul>
          </section>
          {zero.length > 0 && <div className="wh-banner is-amber whm-banner">{t('whm.flow.zeroLines', { names: zero.map((l) => l.item?.name).filter(Boolean).join(', ') })}</div>}
          {shortages && <div className="wh-banner is-red whm-banner">{t('wh.card.shortage')}</div>}
          <section className="whm-card">
            <label className="whm-label">{type === 'receipt' ? t('whm.flow.waybill') : t('whm.flow.photo')}</label>
            <PhotoButton docId={doc.id} kind={type === 'receipt' ? 'waybill' : 'photo'} files={data.files} onUploaded={() => load()} label={type === 'receipt' ? t('whm.flow.photoWaybill') : t('whm.flow.photoAny')} />
          </section>
          {type === 'issue' && data.my.sign && (
            <section className="whm-card">
              <label className="whm-label">{t('wh.sign.title')}</label>
              {signed ? <div className="wh-banner is-green">{t('wh.sign.done')}</div> : <SignaturePad onSave={sign} busy={busy === 'sign'} />}
            </section>
          )}
          <BottomBar>
            <Button type="primary" size="large" block loading={busy === 'post'} disabled={!(data.my.post || data.my.ship)} onClick={post} data-testid="whm-post">
              {type === 'transfer' ? t('wh.actions.ship') : t('wh.actions.post')}
            </Button>
          </BottomBar>
        </>
      )}
      <QtySheet
        open={Boolean(sheet)}
        item={sheet?.item}
        qty={sheet?.qty}
        unit={sheet?.unit}
        title={sheet?.title}
        hint={sheet && type !== 'receipt' ? <HintLine hint={lines.find((l) => l.item?.id === sheet.item.id)?.hint} unit={sheet.item.baseUnit} /> : null}
        onChange={(next) => setSheet((s) => ({ ...s, ...next }))}
        onSubmit={commitSheet}
        onScanCode={(code, { qty }) => {
          // A wedge scanner typed into the quantity: the quantity stays as it was, the code is a scan.
          if (sheetRef.current) sheetRef.current = { ...sheetRef.current, qty };
          onCode(code);
        }}
        onClose={() => setSheet(null)}
        onRemove={sheet?.lineId ? removeLine : null}
        submitLabel={sheet?.lineId ? t('whm.qty.save') : t('whm.qty.add')}
        allowZero={Boolean(sheet?.lineId)}
        busy={busy === 'sheet'}
      />
    </div>
  );
}
