import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Input, Select, Spin, Tooltip, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { userOptions } from '../../shared/People';
import { whApi } from '../api';
import { useWh } from '../WhContext';
import { STATUS_COLORS, TYPE_LOOK, formatMoney, formatQty, whError } from '../lib';

/** Status as a soft pill in its colour. */
export function StatusPill({ status, size }) {
  const { t } = useLocale();
  return (
    <span className={`wh-status${size === 'small' ? ' is-small' : ''}`} style={{ '--c': STATUS_COLORS[status] || '#94A3B8' }}>
      <span className="wh-status__dot" aria-hidden="true" />
      {t(`wh.status.${status}`)}
    </span>
  );
}

/** Document type with its icon. */
export function TypeTag({ type, compact }) {
  const { t } = useLocale();
  const look = TYPE_LOOK[type] || TYPE_LOOK.correction;
  return (
    <span className={`wh-type${compact ? ' is-compact' : ''}`} style={{ '--c': look.color }} title={t(`wh.types.${type}`)}>
      <span className="wh-type__icon" aria-hidden="true">
        <MenuIcon name={look.icon} variant="mono" />
      </span>
      {!compact && <span>{t(`wh.types.${type}`)}</span>}
    </span>
  );
}

/** A sum, or nothing when the server hid it (no warehouse.cost). */
export function Money({ amount, currency, strong = false }) {
  const { locale } = useLocale();
  const { meta } = useWh();
  if (amount === null || amount === undefined) return null;
  const text = formatMoney(amount, currency || meta?.settings?.currency || 'USD', locale);
  return <span className="wh-money">{strong ? <strong>{text}</strong> : text}</span>;
}

export function Qty({ value, unit, strong = false, tone }) {
  const { locale } = useLocale();
  return (
    <span className={`wh-qty${tone ? ` is-${tone}` : ''}`}>
      {strong ? <strong>{formatQty(value, locale)}</strong> : formatQty(value, locale)}
      {unit && <small> {unit}</small>}
    </span>
  );
}

/** «на складе 120 · в резерве 20 · доступно 100» (spec §2). */
export function StockHint({ hint, unit, short }) {
  const { t, locale } = useLocale();
  if (!hint) return null;
  return (
    <span className={`wh-hint${short ? ' is-short' : ''}`}>
      {t('wh.hint.onHand')} {formatQty(hint.qty, locale)}
      {hint.reserved > 0 && (
        <>
          {' · '}
          {t('wh.hint.reserved')} {formatQty(hint.reserved, locale)}
        </>
      )}
      {' · '}
      <strong>
        {t('wh.hint.available')} {formatQty(hint.available, locale)}
      </strong>
      {unit ? ` ${unit}` : ''}
    </span>
  );
}

/** Filter chips with counters. */
export function Chips({ chips, counters, value, onChange, prefix, allKey = 'all' }) {
  const { t } = useLocale();
  return (
    <div className="wh-chips" role="tablist">
      <button type="button" className={`wh-chip${!value ? ' is-active' : ''}`} onClick={() => onChange(undefined)}>
        {t(`${prefix}.all`)}
        {counters && counters[allKey] !== undefined && <em>{counters[allKey]}</em>}
      </button>
      {chips.map((chip) => (
        <button key={chip} type="button" className={`wh-chip chip-${chip}${value === chip ? ' is-active' : ''}`} onClick={() => onChange(value === chip ? undefined : chip)}>
          {t(`${prefix}.${chip}`)}
          {counters && counters[chip] !== undefined && <em className={['below_min', 'out', 'expiring', 'awaiting_receipt', 'handovers'].includes(chip) && counters[chip] ? 'is-alert' : ''}>{counters[chip]}</em>}
        </button>
      ))}
    </div>
  );
}

/** Empty state with an icon, a sentence and what to do. */
export function Empty({ icon = '📦', title, text, action }) {
  return (
    <div className="wh-empty">
      <span className="wh-empty__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** The page header (hero) of a module screen. */
export function Hero({ icon = 'box', title, lead, children, tone }) {
  return (
    <header className={`mod-hero wh-hero${tone ? ` is-${tone}` : ''}`}>
      <span className="mod-hero__badge" aria-hidden="true">
        <MenuIcon name={icon} />
      </span>
      <div className="mod-hero__text">
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children && <div className="mod-hero__actions">{children}</div>}
    </header>
  );
}

/** People picker (the module's /people list). */
export function PersonSelect({ value, onChange, placeholder, allowClear = true, exclude = [], ...rest }) {
  const { loadPeople } = useWh();
  const [people, setPeople] = useState([]);
  useEffect(() => {
    loadPeople().then(setPeople).catch(() => {});
  }, [loadPeople]);
  return (
    <Select
      showSearch
      allowClear={allowClear}
      value={value ?? undefined}
      onChange={(next) => onChange?.(next ?? null)}
      placeholder={placeholder}
      options={userOptions(people.filter((p) => !exclude.includes(p.id)))}
      filterOption={(input, option) => option.search.includes(input.toLowerCase())}
      {...rest}
    />
  );
}

/** Warehouse picker; `right` keeps only those where the person holds it. */
export function WarehouseSelect({ value, onChange, right, placeholder, allowClear = false, exclude = [], ...rest }) {
  const { t } = useLocale();
  const { warehouses } = useWh();
  const list = warehouses.filter((w) => !w.archived && !exclude.includes(w.id) && (!right || (w.rights || []).includes(right)));
  return (
    <Select
      value={value ?? undefined}
      onChange={(next) => onChange?.(next ?? null)}
      allowClear={allowClear}
      placeholder={placeholder || t('wh.fields.warehouse')}
      showSearch
      optionFilterProp="search"
      optionLabelProp="name"
      options={list.map((w) => ({ value: w.id, name: w.name, search: `${w.name} ${w.code}`.toLowerCase(), label: <span className="wh-opt">{w.name}<em>{t(`wh.kinds.${w.kind}`)}</em></span> }))}
      {...rest}
    />
  );
}

/** Item search (name, SKU, barcode) with the item object handed to onPick. */
export function ItemPicker({ onPick, placeholder, autoFocus, tracking, value = null, size, className }) {
  const { t } = useLocale();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const found = useRef(new Map());
  const timer = useRef(null);
  const search = useCallback(
    (q) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setLoading(true);
        whApi
          .items({ q, pageSize: 20, tracking })
          .then((res) => {
            for (const item of res.data.items) found.current.set(item.id, item);
            setOptions(res.data.items.map((item) => ({ value: item.id, label: <span className="wh-opt">{item.name}<em>{[item.sku, `${formatQty(item.stock)} ${item.baseUnit}`].filter(Boolean).join(' · ')}</em></span> })));
          })
          .catch(() => setOptions([]))
          .finally(() => setLoading(false));
      }, 220);
    },
    [tracking]
  );
  useEffect(() => {
    search('');
    return () => clearTimeout(timer.current);
  }, [search]);
  return (
    <Select
      showSearch
      value={value}
      filterOption={false}
      onSearch={search}
      onChange={(id) => {
        const item = found.current.get(id);
        if (item) onPick(item);
      }}
      notFoundContent={loading ? <Spin size="small" /> : t('wh.empty.noItems')}
      placeholder={placeholder || t('wh.lines.searchItem')}
      options={options}
      autoFocus={autoFocus}
      size={size}
      className={className}
      style={{ width: '100%' }}
    />
  );
}

/**
 * Who receives / returns: a person, a Masterplan object or project.
 * value = { type, id, label } | null.
 */
export function HolderPicker({ value, onChange, types = ['employee', 'object', 'project'] }) {
  const { t } = useLocale();
  const { meta } = useWh();
  const masterplan = Boolean(meta?.modules?.masterplan);
  const allowed = types.filter((type) => type === 'employee' || masterplan);
  const type = value?.type || allowed[0];
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [objects, setObjects] = useState([]);
  useEffect(() => {
    if (!masterplan || type === 'employee') return;
    whApi.lookup('projects', {}).then((res) => setProjects(res.data.items)).catch(() => setProjects([]));
  }, [masterplan, type]);
  useEffect(() => {
    if (type !== 'object' || !project) return;
    whApi.lookup('objects', { project }).then((res) => setObjects(res.data.items)).catch(() => setObjects([]));
  }, [type, project]);
  return (
    <div className="wh-holder">
      {allowed.length > 1 && (
        <div className="wh-segment" role="tablist">
          {allowed.map((option) => (
            <button key={option} type="button" className={option === type ? 'is-active' : ''} onClick={() => onChange(option === type ? value : { type: option, id: null, label: '' })}>
              {t(`wh.holders.${option}`)}
            </button>
          ))}
        </div>
      )}
      {type === 'employee' && <PersonSelect value={value?.type === 'employee' ? value.id : null} onChange={(id) => onChange(id ? { type: 'employee', id, label: '' } : null)} placeholder={t('wh.holders.pickPerson')} />}
      {type === 'project' && <Select showSearch optionFilterProp="label" value={value?.type === 'project' ? value.id : undefined} onChange={(id) => onChange({ type: 'project', id, label: projects.find((p) => p.id === id)?.label || '' })} options={projects.map((p) => ({ value: p.id, label: p.label }))} placeholder={t('wh.holders.pickProject')} style={{ width: '100%' }} />}
      {type === 'object' && (
        <div className="wh-holder__pair">
          <Select showSearch optionFilterProp="label" value={project ?? undefined} onChange={setProject} options={projects.map((p) => ({ value: p.id, label: p.label }))} placeholder={t('wh.holders.pickProject')} />
          <Select showSearch optionFilterProp="label" disabled={!project} value={value?.type === 'object' ? value.id : undefined} onChange={(id) => onChange({ type: 'object', id, label: objects.find((o) => o.id === id)?.label || '' })} options={objects.map((o) => ({ value: o.id, label: o.label }))} placeholder={t('wh.holders.pickObject')} />
        </div>
      )}
      {value?.label && value.id && <span className="wh-holder__current">{value.label}</span>}
    </div>
  );
}

/** Bin picker of a warehouse (only when the warehouse has bins). */
export function BinSelect({ warehouseId, value, onChange, placeholder, size }) {
  const { t } = useLocale();
  const { warehouses } = useWh();
  const wh = warehouses.find((w) => w.id === warehouseId);
  const [bins, setBins] = useState([]);
  useEffect(() => {
    if (!wh?.binsEnabled) return;
    whApi.bins(warehouseId).then((res) => setBins(res.data.bins)).catch(() => setBins([]));
  }, [warehouseId, wh?.binsEnabled]);
  if (!wh?.binsEnabled) return null;
  return <Select allowClear showSearch size={size} optionFilterProp="label" value={value ?? undefined} onChange={(id) => onChange(id ?? null)} placeholder={placeholder || t('wh.fields.bin')} options={bins.map((b) => ({ value: b.id, label: b.path }))} style={{ minWidth: 110 }} />;
}

/** Attachments: drop zone, phone camera, list with removal. */
export function FilesBlock({ owner, ownerId, files = [], onChanged, kind, kinds, canEdit = true, accept }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [chosenKind, setChosenKind] = useState(kind || kinds?.[0] || 'other');
  const upload = async (list) => {
    setBusy(true);
    try {
      const res = await whApi.upload(owner, ownerId, list, chosenKind);
      onChanged?.(res.data.files);
      message.success(t('wh.files.uploaded'));
    } catch (err) {
      message.error(whError(err, t));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (file) => {
    try {
      const res = await whApi.removeFile(file.id);
      onChanged?.(res.data.files);
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  return (
    <div className="wh-files">
      {files.length > 0 && (
        <ul className="wh-files__list">
          {files.map((file) => (
            <li key={file.id}>
              {/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? <img src={`/api${file.url.replace(/^\/api/, '')}`} alt="" /> : <span className="wh-files__icon">📎</span>}
              <a href={`/api${file.url.replace(/^\/api/, '')}`} target="_blank" rel="noreferrer">{file.kind === 'signature' ? t('wh.files.signature') : file.name}</a>
              <em>{t(`wh.files.kinds.${file.kind}`)}</em>
              {canEdit && file.kind !== 'signature' && (
                <Button type="text" size="small" danger onClick={() => remove(file)} aria-label={t('common.delete')}>
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          {kinds?.length > 1 && <Select size="small" value={chosenKind} onChange={setChosenKind} options={kinds.map((k) => ({ value: k, label: t(`wh.files.kinds.${k}`) }))} style={{ minWidth: 160, marginBottom: 8 }} />}
          <Upload.Dragger multiple showUploadList={false} accept={accept || 'image/*,.pdf,.doc,.docx,.xls,.xlsx'} beforeUpload={(file, list) => { if (file === list[0]) upload(list); return false; }} disabled={busy}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{busy ? t('wh.files.uploading') : t('wh.files.drop')}</p>
          </Upload.Dragger>
        </>
      )}
    </div>
  );
}

/** The recipient signs with a finger on the screen (spec §5 «получатель подписывает на экране»). */
export function SignaturePad({ onSave, busy }) {
  const { t } = useLocale();
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = el.getBoundingClientRect();
    el.width = rect.width * ratio;
    el.height = rect.height * ratio;
    const ctx = el.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);
  const point = (event) => {
    const rect = canvas.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const down = (event) => {
    event.preventDefault();
    canvas.current.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    const ctx = canvas.current.getContext('2d');
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (event) => {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext('2d');
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDirty(true);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const el = canvas.current;
    el.getContext('2d').clearRect(0, 0, el.width, el.height);
    setDirty(false);
  };
  const save = () => {
    // White background so the PNG reads well in dark mode and in print.
    const el = canvas.current;
    const out = document.createElement('canvas');
    out.width = el.width;
    out.height = el.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(el, 0, 0);
    onSave(out.toDataURL('image/png'), name.trim());
  };
  return (
    <div className="wh-sign">
      <canvas ref={canvas} className="wh-sign__pad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label={t('wh.sign.pad')} />
      <span className="wh-sign__hint">{t('wh.sign.hint')}</span>
      <div className="wh-sign__row">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('wh.sign.name')} maxLength={200} />
        <Button onClick={clear} disabled={!dirty}>{t('wh.sign.clear')}</Button>
        <Button type="primary" onClick={save} disabled={!dirty} loading={busy}>{t('wh.sign.save')}</Button>
      </div>
    </div>
  );
}

/** A small «?» tooltip. */
export function Tip({ text }) {
  return (
    <Tooltip title={text}>
      <span className="wh-tip" aria-label={text}>?</span>
    </Tooltip>
  );
}
