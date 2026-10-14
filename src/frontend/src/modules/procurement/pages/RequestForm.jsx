import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, AutoComplete, Button, Input, InputNumber, Result, Segmented, Select, Skeleton, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { DateField } from '../../../components/ui/DateTimeField';
import { HintLabel } from '../../../help/Hint';
import { errorMessage } from '../../../lib/errors';
import { UrgencyPicker } from '../../approvals/ApprovalActions';
import { useApprovalsMeta } from '../../approvals/lib';
import { docUrl, procApi } from '../api';
import { useProc } from '../ProcContext';
import { DOC_ICONS, formatMoney, itemsSum } from '../lib';
import { PersonSelect, StatusPill } from '../components/bits';
import { RemoteSelect } from '../components/pickers';
import DropZone from '../components/DropZone';
import { procError } from '../card/RequestCard';

const AUTOSAVE_MS = 900;

/** Form state from a request card. */
function fromRequest(request) {
  return {
    title: request.title || '',
    description: request.description || '',
    hasItems: request.hasItems,
    items: request.items.length ? request.items.map(({ name, qty, unit, price }) => ({ name, qty, unit, price })) : [{ name: '', qty: 1, unit: '', price: null }],
    amount: request.hasItems ? null : request.amount || null,
    currency: request.currency,
    category: request.category || null,
    legalEntityId: request.legalEntity?.id || null,
    paymentTerms: request.paymentTerms || 'full',
    advancePercent: request.advancePercent || 50,
    urgency: request.urgency || null,
    payBy: request.payBy || null,
    deliverBy: request.deliverBy || null,
    supplier: request.supplier?.companyId ? { id: request.supplier.companyId, label: request.supplier.name } : null,
    supplierName: request.supplier?.name || '',
    supplierContact: request.supplier?.contact || '',
    project: request.project?.id ? request.project : null,
    object: request.object?.id ? request.object : null,
    deal: request.deal?.id ? request.deal : null,
    contract: request.contract?.id ? request.contract : null,
    responsibleId: request.responsible?.id || null,
  };
}

/** What the API receives. */
function toPayload(form) {
  return {
    title: form.title,
    description: form.description,
    hasItems: form.hasItems,
    items: form.hasItems ? form.items.filter((item) => item.name || item.price) : [],
    amount: form.hasItems ? undefined : form.amount ?? 0,
    currency: form.currency,
    category: form.category,
    legalEntityId: form.legalEntityId,
    paymentTerms: form.paymentTerms,
    advancePercent: form.paymentTerms === 'advance' ? form.advancePercent : null,
    urgency: form.urgency,
    payBy: form.payBy,
    deliverBy: form.deliverBy,
    supplierCompanyId: form.supplier?.id || null,
    supplierName: form.supplier?.label || form.supplierName || null,
    supplierContact: form.supplierContact || null,
    projectId: form.project?.id || null,
    projectLabel: form.project?.label || null,
    objectId: form.object?.id || null,
    objectLabel: form.object?.label || null,
    dealId: form.deal?.id || null,
    dealLabel: form.deal?.label || null,
    contractId: form.contract?.id || null,
    contractLabel: form.contract?.label || null,
    responsibleId: form.responsibleId || undefined,
  };
}

function Section({ title, children, hint }) {
  return (
    <section className="prc-section">
      <h3>
        {hint ? <HintLabel id={hint}>{title}</HintLabel> : title}
      </h3>
      {children}
    </section>
  );
}

function ItemsEditor({ items, onChange, currency, units }) {
  const { t, locale } = useLocale();
  const set = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="prc-items-edit">
      {items.map((item, index) => (
        <div key={index} className="prc-items-edit__row">
          <Input className="is-name" value={item.name} onChange={(event) => set(index, { name: event.target.value })} placeholder={t('procurement.items.namePlaceholder')} maxLength={300} />
          <InputNumber className="is-qty" value={item.qty} onChange={(qty) => set(index, { qty })} min={0} placeholder={t('procurement.items.qty')} inputMode="decimal" />
          <AutoComplete className="is-unit" value={item.unit} onChange={(unit) => set(index, { unit })} options={units.map((unit) => ({ value: unit }))} placeholder={t('procurement.items.unit')} />
          <InputNumber className="is-price" value={item.price} onChange={(price) => set(index, { price })} min={0} step={0.01} placeholder={t('procurement.items.price')} inputMode="decimal" />
          <span className="is-sum">{formatMoney((Number(item.qty) || 0) * (Number(item.price) || 0), currency, locale)}</span>
          <Button type="text" icon={<DeleteOutlined />} aria-label={t('common.delete')} onClick={() => onChange(items.length > 1 ? items.filter((_, i) => i !== index) : [{ name: '', qty: 1, unit: '', price: null }])} />
        </div>
      ))}
      <div className="prc-items-edit__foot">
        <Button icon={<PlusOutlined />} onClick={() => onChange([...items, { name: '', qty: 1, unit: '', price: null }])}>
          {t('procurement.items.add')}
        </Button>
        <span>
          {t('procurement.items.total')}: <strong>{formatMoney(itemsSum(items), currency, locale)}</strong>
        </span>
      </div>
    </div>
  );
}

/**
 * Create / edit a request (spec §5.3.4): one column, the essence and the
 * amount on top, the invoice by drag & drop or a phone photo. The draft saves
 * itself; «Отправить на согласование» at the bottom.
 */
export default function RequestForm() {
  const { t, locale } = useLocale();
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { meta, touch } = useProc();
  const approvalsMeta = useApprovalsMeta();
  const [requestId, setRequestId] = useState(routeId ? Number(routeId) : null);
  const [card, setCard] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [save, setSave] = useState({ state: 'idle', at: null });
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [contractsOk, setContractsOk] = useState(true);
  const [more, setMore] = useState(false);
  const dirty = useRef(false);
  const creating = useRef(null);
  const timer = useRef(null);
  const settings = meta.settings;

  // Load (edit) or start empty (new).
  useEffect(() => {
    if (!routeId) {
      setForm({
        ...fromRequest({ items: [], hasItems: false, currency: settings.currency, paymentTerms: 'full', legalEntity: meta.legalEntities.find((entity) => entity.isDefault) || meta.legalEntities[0] }),
        urgency: approvalsMeta?.settings?.defaultUrgency || null,
      });
      return;
    }
    procApi
      .get(routeId)
      .then((res) => {
        setCard(res.data);
        setForm(fromRequest(res.data.request));
        setMore(Boolean(res.data.request.deliverBy || res.data.request.project || res.data.request.deal || res.data.request.contract || res.data.request.description));
      })
      .catch(setLoadError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // Saves run one after another (an older PUT never lands after a newer one);
  // only the newest answer updates the card.
  const queue = useRef(Promise.resolve());
  const saveSeq = useRef(0);
  const idRef = useRef(requestId);
  idRef.current = requestId;
  const persist = useCallback((current) => {
    const mine = ++saveSeq.current;
    const latest = () => mine === saveSeq.current;
    const run = queue.current.then(async () => {
      if (latest()) setSave({ state: 'saving', at: null });
      try {
        let res;
        if (!idRef.current) {
          // The first save creates the draft (once, even if typing goes on).
          const first = !creating.current;
          creating.current = creating.current || procApi.create(toPayload(current));
          res = await creating.current;
          const newId = res.data.request.id;
          idRef.current = newId;
          setRequestId(newId);
          // The address follows without remounting the form (typing goes on).
          window.history.replaceState(window.history.state, '', `/app/procurement/requests/${newId}/edit`);
          if (!first) res = await procApi.update(newId, toPayload(current));
        } else {
          res = await procApi.update(idRef.current, toPayload(current));
        }
        if (latest()) {
          setCard(res.data);
          setSave({ state: 'saved', at: new Date() });
          touch();
        }
        return res.data;
      } catch (err) {
        if (latest()) setSave({ state: 'error', at: null });
        message.error(procError(err, t));
        return null;
      }
    });
    queue.current = run.catch(() => null);
    return run;
  }, [touch, message, t]);

  // Autosave after a pause.
  useEffect(() => {
    if (!form || !dirty.current) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dirty.current = false;
      persist(form);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer.current);
  }, [form, persist]);

  const set = (patch) => {
    dirty.current = true;
    setForm((prev) => ({ ...prev, ...patch }));
  };

  /** Saves now (if needed) and returns the request id. */
  const flush = async () => {
    clearTimeout(timer.current);
    if (dirty.current || !requestId) {
      dirty.current = false;
      const data = await persist(form);
      return data?.request?.id || null;
    }
    return requestId;
  };

  const upload = async (files) => {
    const id = await flush();
    if (!id) return;
    setProgress(0);
    try {
      const hasInvoice = (card?.documents || []).some((doc) => doc.kind === 'invoice');
      await procApi.upload(id, files, hasInvoice ? 'other' : 'invoice', (event) => setProgress(Math.round((event.loaded / (event.total || 1)) * 100)));
      const res = await procApi.get(id);
      setCard(res.data);
      message.success(t('procurement.docs.uploaded', { n: files.length }));
    } catch (err) {
      message.error(procError(err, t));
    } finally {
      setProgress(null);
    }
  };
  const linkNodes = async (nodes) => {
    const id = await flush();
    if (!id) return;
    try {
      const hasInvoice = (card?.documents || []).some((doc) => doc.kind === 'invoice');
      for (const [index, node] of nodes.entries()) await procApi.linkFile(id, node.id, !hasInvoice && index === 0 ? 'invoice' : 'other');
      const res = await procApi.get(id);
      setCard(res.data);
    } catch (err) {
      message.error(procError(err, t));
    }
  };
  const removeDoc = async (doc) => {
    try {
      await procApi.removeDoc(doc.id);
      const res = await procApi.get(requestId);
      setCard(res.data);
    } catch (err) {
      message.error(procError(err, t));
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const id = await flush();
      if (!id) return;
      await procApi.action(id, 'submit', { urgency: form.urgency });
      message.success(t('procurement.done.submit'));
      touch();
      navigate(`/app/procurement/requests/${id}`);
    } catch (err) {
      message.error(procError(err, t));
      if (requestId) procApi.get(requestId).then((res) => setCard(res.data)).catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const done = async () => {
    const id = await flush();
    navigate(id ? `/app/procurement/requests/${id}` : '/app/procurement/requests');
  };

  const total = form?.hasItems ? itemsSum(form.items) : Number(form?.amount) || 0;
  const documents = card?.documents || [];
  const hasInvoice = documents.some((doc) => doc.kind === 'invoice');
  const missing = useMemo(() => {
    if (!form) return [];
    const out = [];
    if (!form.title.trim()) out.push('TITLE_REQUIRED');
    if (!(total > 0)) out.push('AMOUNT_REQUIRED');
    if (settings.invoiceRequired && !hasInvoice) out.push('INVOICE_REQUIRED');
    return out;
  }, [form, total, hasInvoice, settings.invoiceRequired]);

  if (loadError) return <Result status={loadError?.response?.status === 404 ? '404' : 'warning'} title={loadError?.response?.status === 404 ? t('procurement.notFound') : errorMessage(loadError)} extra={<Link to="/app/procurement">{t('procurement.nav.requests')}</Link>} />;
  if (!meta.rights.canCreate && !routeId) return <Result status="403" title={t('procurement.cannotCreate')} />;
  if (!form) return <div className="prc-form"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  if (card && !card.my.canEdit) {
    return <Result status="info" title={t('procurement.notEditable')} extra={<Button type="primary" onClick={() => navigate(`/app/procurement/requests/${card.request.id}`)}>{t('procurement.openCard')}</Button>} />;
  }

  const saveText = save.state === 'saving' ? t('procurement.form.saving') : save.state === 'saved' ? t('procurement.form.saved') : save.state === 'error' ? t('procurement.form.saveError') : requestId ? t('procurement.form.draft') : t('procurement.form.autosave');
  const categories = (settings.categories || []).filter((item) => !item.archived || item.key === form.category);
  const canSubmit = !card || card.my.actions.includes('submit');

  return (
    <div className="prc-form">
      <header className="prc-form__head">
        <Link to={requestId ? `/app/procurement/requests/${requestId}` : '/app/procurement/requests'} className="prc-back">← {t('procurement.nav.requests')}</Link>
        <div className="prc-form__title">
          <h1>{routeId ? t('procurement.form.editTitle') : t('procurement.form.newTitle')}</h1>
          {card && <span className="prc-form__no">{card.request.number}</span>}
          {card && <StatusPill status={card.request.status} />}
          <span className={`prc-save is-${save.state}`}>{saveText}</span>
        </div>
      </header>

      {card?.request.status === 'question' && <div className="prc-alert is-orange">{t('procurement.form.questionNote')}</div>}
      {card?.request.status === 'returned' && <div className="prc-alert is-orange">{t('procurement.form.returnedNote')}</div>}

      <Section title={t('procurement.form.what')}>
        <Input size="large" autoFocus={!routeId} value={form.title} onChange={(event) => set({ title: event.target.value })} placeholder={t('procurement.form.titlePlaceholder')} maxLength={300} className="prc-form__title-input" />
        <div className="prc-amount-row">
          <Segmented value={form.hasItems ? 'items' : 'amount'} onChange={(value) => set({ hasItems: value === 'items' })} options={[{ value: 'amount', label: t('procurement.form.oneAmount') }, { value: 'items', label: t('procurement.form.lineItems') }]} />
        </div>
        {form.hasItems ? (
          <>
            <ItemsEditor items={form.items} onChange={(items) => set({ items })} currency={form.currency} units={settings.units || []} />
            <Select value={form.currency} onChange={(currency) => set({ currency })} options={settings.currencies.map((code) => ({ value: code, label: code }))} className="prc-currency" />
          </>
        ) : (
          <div className="prc-amount">
            <InputNumber size="large" value={form.amount} onChange={(amount) => set({ amount })} min={0} step={0.01} placeholder={t('procurement.form.amountPlaceholder')} inputMode="decimal" className="prc-amount__input" formatter={(value) => (value === undefined || value === null || value === '' ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' '))} parser={(value) => String(value || '').replace(/[\s ]/g, '').replace(',', '.')} />
            <Select size="large" value={form.currency} onChange={(currency) => set({ currency })} options={settings.currencies.map((code) => ({ value: code, label: code }))} className="prc-amount__currency" />
          </div>
        )}
      </Section>

      <Section title={t('procurement.form.invoice')} hint="procurement.invoice">
        {documents.length > 0 && (
          <ul className="prc-doclist is-compact">
            {documents.map((doc) => (
              <li key={doc.id}>
                <a className="prc-doclist__main" href={docUrl(doc)} target="_blank" rel="noreferrer">
                  <span className="prc-doclist__icon" aria-hidden="true">{DOC_ICONS[doc.kind] || '📎'}</span>
                  <span className="prc-doclist__text">
                    <strong>{doc.name}</strong>
                    <small>{t(`procurement.docKind.${doc.kind}`)}</small>
                  </span>
                </a>
                <Tooltip title={t('common.delete')}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeDoc(doc)} />
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
        <DropZone onFiles={upload} onNodes={linkNodes} progress={progress} title={hasInvoice ? t('procurement.drop.more') : t('procurement.drop.title')} hint={settings.invoiceRequired && !hasInvoice ? t('procurement.drop.required') : t('procurement.drop.hint')} />
      </Section>

      <Section title={t('procurement.fields.urgency')}>
        <UrgencyPicker value={form.urgency || approvalsMeta?.settings?.defaultUrgency} onChange={(urgency) => set({ urgency })} />
        <div className="prc-two">
          <label>
            <span>{t('procurement.fields.payBy')}</span>
            <DateField value={form.payBy} onChange={(payBy) => set({ payBy })} style={{ width: '100%' }} />
          </label>
          <label>
            <span>{t('procurement.fields.category')}</span>
            <Select allowClear value={form.category ?? undefined} onChange={(category) => set({ category: category ?? null })} placeholder={t('procurement.form.categoryPlaceholder')} options={categories.map((item) => ({ value: item.key, label: <span className="prc-cat-opt"><i style={{ background: item.color }} />{item.name}</span> }))} />
          </label>
        </div>
      </Section>

      <Section title={t('procurement.fields.supplier')}>
        {meta.modules.companies ? (
          <RemoteSelect kind="companies" value={form.supplier} onChange={(supplier) => set({ supplier, supplierName: supplier ? supplier.label : form.supplierName })} placeholder={t('procurement.form.supplierPick')} style={{ width: '100%' }} />
        ) : null}
        {(!meta.modules.companies || !form.supplier) && (
          <Input value={form.supplierName} onChange={(event) => set({ supplierName: event.target.value })} placeholder={meta.modules.companies ? t('procurement.form.supplierOrText') : t('procurement.form.supplierName')} maxLength={300} className="prc-mt8" />
        )}
        <Input value={form.supplierContact} onChange={(event) => set({ supplierContact: event.target.value })} placeholder={t('procurement.form.supplierContact')} maxLength={500} className="prc-mt8" />
      </Section>

      <Section title={t('procurement.form.money')} hint="procurement.paymentTerms">
        <div className="prc-two">
          <label>
            <span>{t('procurement.fields.legalEntity')}</span>
            <Select value={form.legalEntityId ?? undefined} onChange={(legalEntityId) => set({ legalEntityId })} options={meta.legalEntities.map((entity) => ({ value: entity.id, label: entity.label }))} placeholder="—" />
          </label>
          <label>
            <span>{t('procurement.fields.paymentTerms')}</span>
            <Segmented block value={form.paymentTerms} onChange={(paymentTerms) => set({ paymentTerms })} options={meta.paymentTerms.map((key) => ({ value: key, label: t(`procurement.terms.${key}Short`) }))} />
          </label>
        </div>
        {form.paymentTerms === 'advance' && (
          <InputNumber value={form.advancePercent} onChange={(advancePercent) => set({ advancePercent })} min={1} max={100} addonBefore={t('procurement.terms.advanceLabel')} addonAfter="%" className="prc-mt8" />
        )}
      </Section>

      {!more ? (
        <Button type="dashed" block onClick={() => setMore(true)} className="prc-more-btn" icon={<PlusOutlined />}>
          {t('procurement.form.more')}
        </Button>
      ) : (
        <>
          <Section title={t('procurement.form.details')}>
            <Input.TextArea value={form.description} onChange={(event) => set({ description: event.target.value })} autoSize={{ minRows: 3, maxRows: 10 }} placeholder={t('procurement.form.descriptionPlaceholder')} maxLength={20000} />
            <div className="prc-two prc-mt8">
              <label>
                <span>{t('procurement.fields.deliverBy')}</span>
                <DateField value={form.deliverBy} onChange={(deliverBy) => set({ deliverBy })} style={{ width: '100%' }} />
              </label>
              <label>
                <HintLabel id="procurement.responsible">{t('procurement.fields.responsible')}</HintLabel>
                <PersonSelect value={form.responsibleId} onChange={(responsibleId) => set({ responsibleId })} allowClear={false} placeholder={t('procurement.form.responsiblePlaceholder')} />
              </label>
            </div>
          </Section>
          {(meta.modules.masterplan || meta.modules.crm || (meta.modules.contracts && contractsOk)) && (
            <Section title={t('procurement.form.links')} hint="procurement.links">
              <div className="prc-two">
                {meta.modules.masterplan && (
                  <label>
                    <span>{t('procurement.fields.project')}</span>
                    <RemoteSelect kind="projects" value={form.project} onChange={(project) => set({ project, object: null })} placeholder={t('procurement.form.pick')} />
                  </label>
                )}
                {meta.modules.masterplan && form.project && (
                  <label>
                    <span>{t('procurement.fields.object')}</span>
                    <RemoteSelect kind="objects" params={{ project: form.project.id }} value={form.object} onChange={(object) => set({ object })} placeholder={t('procurement.form.pick')} />
                  </label>
                )}
                {meta.modules.crm && (
                  <label>
                    <span>{t('procurement.fields.deal')}</span>
                    <RemoteSelect kind="deals" value={form.deal} onChange={(deal) => set({ deal })} placeholder={t('procurement.form.pick')} />
                  </label>
                )}
                {meta.modules.contracts && contractsOk && (
                  <label>
                    <span>{t('procurement.fields.contract')}</span>
                    <RemoteSelect kind="contracts" value={form.contract} onChange={(contract) => set({ contract })} placeholder={t('procurement.form.pick')} onUnavailable={() => setContractsOk(false)} />
                  </label>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      <footer className="prc-form__bar">
        <div className="prc-form__total">
          <small>{t('procurement.fields.amount')}</small>
          <strong>{formatMoney(total, form.currency, locale)}</strong>
        </div>
        <span className="prc-grow" />
        <Button size="large" onClick={done}>
          {t('procurement.form.done')}
        </Button>
        {canSubmit && (
          <Tooltip title={missing.length ? missing.map((code) => t(`procurement.errors.${code}`)).join(' · ') : null}>
            <Button type="primary" size="large" loading={busy} disabled={missing.length > 0} onClick={submit}>
              {card?.request.status === 'returned' ? t('procurement.actions.resubmit') : t('procurement.actions.submit')}
            </Button>
          </Tooltip>
        )}
      </footer>
    </div>
  );
}
