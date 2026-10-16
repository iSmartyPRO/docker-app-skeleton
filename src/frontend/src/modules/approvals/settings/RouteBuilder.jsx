import { useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Input, InputNumber, Popconfirm, Segmented, Select, Skeleton, Tag, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale } from '../../../context/LocaleContext';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { errorMessage } from '../../../lib/errors';
import { moduleById } from '../../registry';
import { approvalsApi } from '../api';
import { MODULE_LOOK, formatMoney, tr } from '../lib';
import { ApproverSelect, PersonSelect } from '../components/pickers';

const CURRENCIES = ['USD', 'KGS', 'RUB', 'EUR', 'KZT', 'CNY'];
const OPS = {
  money: ['gte', 'gt', 'lte', 'lt', 'eq', 'neq'],
  number: ['gte', 'gt', 'lte', 'lt', 'eq', 'neq'],
  select: ['eq', 'neq', 'in', 'nin', 'empty', 'filled'],
  ref: ['eq', 'neq', 'in', 'nin', 'empty', 'filled'],
  text: ['eq', 'neq', 'empty', 'filled'],
  bool: ['eq'],
};
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Stage values for the editor: approvers as { kind, id|key } only. */
function editable(route) {
  return {
    name: route.name || '',
    restartFrom: route.restartFrom || 'first',
    escalateTo: (route.escalateTo || []).map((a) => (a.kind === 'permission' ? { kind: 'permission', key: a.key } : { kind: a.kind, id: a.id })),
    stages: (route.stages || []).map((stage) => ({
      id: stage.id || newId(),
      name: stage.name || '',
      mode: stage.mode || 'all',
      approvers: (stage.approvers || []).map((a) => (a.kind === 'permission' ? { kind: 'permission', key: a.key, name: a.name } : a.kind === 'manager' ? { kind: 'manager', level: a.level || 1 } : { kind: a.kind, id: a.id })),
      conditions: stage.conditions || [],
    })),
  };
}

function ConditionRow({ condition, fields, options, onChange, onRemove }) {
  const { t, locale } = useLocale();
  const field = fields.find((item) => item.key === condition.field) || fields[0];
  const ops = OPS[field?.type] || OPS.text;
  const choices = (options[field?.key] || field?.options || []).map((option) => ({ value: option.value, label: tr(option.label, locale) }));
  const multi = condition.op === 'in' || condition.op === 'nin';
  const noValue = condition.op === 'empty' || condition.op === 'filled';
  let valueInput = null;
  if (!noValue) {
    if (choices.length) {
      valueInput = (
        <Select
          mode={multi ? 'multiple' : undefined}
          value={multi ? (Array.isArray(condition.value) ? condition.value : condition.value !== undefined ? [condition.value] : []) : condition.value}
          onChange={(value) => onChange({ ...condition, value })}
          options={choices}
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 160, flex: 1 }}
          placeholder={t('approvals.routes.value')}
        />
      );
    } else if (field?.type === 'money' || field?.type === 'number') {
      valueInput = (
        <InputNumber
          value={condition.value}
          onChange={(value) => onChange({ ...condition, value })}
          min={0}
          style={{ flex: 1, minWidth: 120 }}
          formatter={(value) => (value === undefined || value === null || value === '' ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' '))}
          parser={(value) => String(value || '').replace(/\s/g, '')}
          placeholder="5 000"
        />
      );
    } else if (field?.type === 'bool') {
      valueInput = <Segmented value={condition.value === true ? 'yes' : 'no'} onChange={(value) => onChange({ ...condition, value: value === 'yes' })} options={[{ value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }]} />;
    } else {
      valueInput = <Input value={condition.value} onChange={(event) => onChange({ ...condition, value: event.target.value })} style={{ flex: 1, minWidth: 140 }} placeholder={t('approvals.routes.value')} />;
    }
  }
  return (
    <div className="apr-cond">
      <span className="apr-cond__if">{t('approvals.routes.if')}</span>
      <Select
        value={field?.key}
        onChange={(key) => {
          const next = fields.find((item) => item.key === key);
          onChange({ field: key, op: (OPS[next?.type] || OPS.text)[0], value: undefined });
        }}
        options={fields.map((item) => ({ value: item.key, label: tr(item.label, locale) || item.key }))}
        style={{ minWidth: 130 }}
      />
      <Select value={condition.op} onChange={(op) => onChange({ ...condition, op, value: op === 'in' || op === 'nin' ? [] : condition.value })} options={ops.map((op) => ({ value: op, label: t(`approvals.ops.${op}`) }))} style={{ minWidth: 120 }} />
      {valueInput}
      {field?.type === 'money' && !noValue && (
        <Select allowClear value={condition.currency} onChange={(currency) => onChange({ ...condition, currency })} options={CURRENCIES.map((code) => ({ value: code, label: code }))} placeholder={t('approvals.routes.anyCurrency')} style={{ width: 120 }} />
      )}
      <Button type="text" onClick={onRemove} aria-label={t('common.delete')}>
        ✕
      </Button>
    </div>
  );
}

function StageCard({ stage, index, fields, options, onChange, onRemove }) {
  const { t } = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const permission = stage.approvers.filter((a) => a.kind === 'permission');
  return (
    <li ref={setNodeRef} style={style} className={`apr-stage${isDragging ? ' is-dragging' : ''}`}>
      <div className="apr-stage__head">
        <button type="button" className="apr-stage__handle" {...attributes} {...listeners} aria-label={t('approvals.routes.drag')}>
          ⠿
        </button>
        <span className="apr-stage__num">{index + 1}</span>
        <Input value={stage.name} onChange={(event) => onChange({ ...stage, name: event.target.value })} placeholder={t('approvals.routes.stageName')} maxLength={80} className="apr-stage__name" />
        <Segmented value={stage.mode} onChange={(mode) => onChange({ ...stage, mode })} options={[{ value: 'all', label: t('approvals.mode.all') }, { value: 'any', label: t('approvals.mode.any') }]} />
        <Popconfirm title={t('approvals.routes.removeStage')} onConfirm={onRemove} okText={t('common.delete')} cancelText={t('common.cancel')}>
          <Button type="text" danger aria-label={t('common.delete')}>
            ✕
          </Button>
        </Popconfirm>
      </div>
      <div className="apr-stage__row">
        <label>{t('approvals.routes.approvers')}</label>
        <div>
          <ApproverSelect value={stage.approvers} onChange={(approvers) => onChange({ ...stage, approvers })} />
          {permission.map((a) => (
            <Tag key={a.key} className="apr-stage__perm" closable onClose={() => onChange({ ...stage, approvers: stage.approvers.filter((x) => x !== a) })}>
              {t('approvals.path.admins')} · {a.key}
            </Tag>
          ))}
          <div className="apr-stage__hint">{t(stage.mode === 'any' ? 'approvals.routes.anyHint' : 'approvals.routes.allHint')}</div>
          {stage.approvers.some((a) => a.kind === 'manager') && <div className="apr-stage__hint apr-stage__hint--manager">★ {t('approvals.manager.hint')}</div>}
        </div>
      </div>
      <div className="apr-stage__row">
        <label>{t('approvals.routes.conditions')}</label>
        <div className="apr-stage__conds">
          {stage.conditions.length === 0 && <span className="apr-stage__always">{t('approvals.routes.always')}</span>}
          {stage.conditions.map((condition, i) => (
            <ConditionRow
              key={i}
              condition={condition}
              fields={fields}
              options={options}
              onChange={(next) => onChange({ ...stage, conditions: stage.conditions.map((c, j) => (j === i ? next : c)) })}
              onRemove={() => onChange({ ...stage, conditions: stage.conditions.filter((_, j) => j !== i) })}
            />
          ))}
          {fields.length > 0 && stage.conditions.length < 6 && (
            <Button size="small" type="dashed" onClick={() => onChange({ ...stage, conditions: [...stage.conditions, { field: fields[0].key, op: (OPS[fields[0].type] || OPS.text)[0] }] })} icon={<PlusOutlined />}>
              {t('approvals.routes.addCondition')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** An approver as the preview names it: people, roles, groups, the author's manager (resolved or not), the fallback. */
function previewName(a, t) {
  if (a.kind === 'permission') return a.via === 'fallback' ? t('approvals.manager.fallbackAdmins') : t('approvals.path.admins');
  if (a.kind === 'manager') return a.resolved ? t('approvals.manager.who', { name: a.resolved.name }) : t(`approvals.manager.level${a.level || 1}`);
  if (a.via?.startsWith('manager')) return t('approvals.manager.who', { name: a.name });
  if (a.via === 'fallback') return t('approvals.manager.fallbackWho', { name: a.name });
  return a.name;
}

/** «Для заявки на $5 000 категории «Оборудование» маршрут будет таким»: try values against the draft route. */
function Preview({ type, route, fields, options }) {
  const { t, locale } = useLocale();
  const [values, setValues] = useState({});
  const [authorId, setAuthorId] = useState(null);
  const [result, setResult] = useState(null);
  const draft = useMemo(() => JSON.stringify(route), [route]);
  const hasManager = route.stages.some((stage) => stage.approvers.some((a) => a.kind === 'manager'));
  useEffect(() => {
    const timer = setTimeout(() => {
      approvalsApi
        .preview(type.key, values, JSON.parse(draft), hasManager ? authorId : null)
        .then((res) => setResult(res.data))
        .catch(() => setResult(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [type.key, values, draft, authorId, hasManager]);
  const describe = fields
    .filter((field) => values[field.key] !== undefined && values[field.key] !== null && values[field.key] !== '')
    .map((field) => {
      if (field.type === 'money') return formatMoney(values[field.key], values.currency || 'USD', locale);
      const option = (options[field.key] || field.options || []).find((item) => String(item.value) === String(values[field.key]));
      return `${tr(field.label, locale)} «${option ? tr(option.label, locale) : values[field.key]}»`;
    })
    .join(', ');
  return (
    <aside className="apr-preview">
      <h4>{t('approvals.routes.previewTitle')}</h4>
      <div className="apr-preview__inputs">
        {hasManager && (
          <label data-tour="approvals.previewAuthor">
            <span>{t('approvals.manager.previewAuthor')}</span>
            <PersonSelect value={authorId} onChange={setAuthorId} allowClear placeholder={t('approvals.manager.previewAuthorPlaceholder')} />
          </label>
        )}
        {fields.map((field) => {
          const choices = (options[field.key] || field.options || []).map((option) => ({ value: option.value, label: tr(option.label, locale) }));
          return (
            <label key={field.key}>
              <span>{tr(field.label, locale) || field.key}</span>
              {field.type === 'money' || field.type === 'number' ? (
                <div className="apr-preview__money">
                  <InputNumber value={values[field.key]} onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))} min={0} style={{ flex: 1 }} placeholder="5 000" />
                  {field.type === 'money' && (
                    <Select value={values.currency || 'USD'} onChange={(currency) => setValues((prev) => ({ ...prev, currency }))} options={CURRENCIES.map((code) => ({ value: code, label: code }))} style={{ width: 90 }} />
                  )}
                </div>
              ) : choices.length ? (
                <Select allowClear value={values[field.key]} onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))} options={choices} showSearch optionFilterProp="label" />
              ) : (
                <Input value={values[field.key]} onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))} />
              )}
            </label>
          );
        })}
      </div>
      <p className="apr-preview__sentence">
        {describe ? t('approvals.routes.previewFor', { doc: tr(type.title, locale), what: describe }) : t('approvals.routes.previewAny', { doc: tr(type.title, locale) })}
      </p>
      {result ? (
        result.stages.length ? (
          <ol className="apr-preview__chain">
            {result.stages.map((stage, index) => (
              <li key={stage.id}>
                <span className="apr-preview__n">{index + 1}</span>
                <span>
                  <b>{stage.name || t('approvals.path.stage', { n: index + 1 })}</b>
                  <em>
                    {stage.approvers.map((a) => previewName(a, t)).join(stage.mode === 'any' ? ` ${t('approvals.routes.or')} ` : ', ')}
                  </em>
                  {stage.managerMissing?.length > 0 && <em className="apr-preview__warn">{t('approvals.manager.missing')}</em>}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="apr-preview__auto">{t('approvals.routes.previewAuto')}</p>
        )
      ) : (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      )}
      {result?.skipped?.length > 0 && <p className="apr-preview__skipped">{t('approvals.routes.previewSkipped', { names: result.skipped.map((s) => s.name || '—').join(', ') })}</p>}
    </aside>
  );
}

function RouteEditor({ type, onSaved }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [loaded, setLoaded] = useState(null);
  const [route, setRoute] = useState(null);
  const [options, setOptions] = useState({});
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    let alive = true;
    setRoute(null);
    approvalsApi
      .route(type.key)
      .then((res) => {
        if (!alive) return;
        setLoaded(res.data.route);
        setRoute(editable(res.data.route));
      })
      .catch((err) => message.error(errorMessage(err)));
    for (const field of type.fields) {
      if ((field.type === 'select' || field.type === 'ref') && !field.options?.length) {
        approvalsApi
          .fieldOptions(type.key, field.key)
          .then((res) => alive && setOptions((prev) => ({ ...prev, [field.key]: res.data.options })))
          .catch(() => {});
      }
    }
    return () => {
      alive = false;
    };
  }, [type.key, type.fields, message]);

  if (!route) return <Skeleton active paragraph={{ rows: 8 }} />;
  const dirty = loaded && JSON.stringify(editable(loaded)) !== JSON.stringify(route);
  const setStage = (index, stage) => setRoute((prev) => ({ ...prev, stages: prev.stages.map((s, i) => (i === index ? stage : s)) }));
  const save = async () => {
    setSaving(true);
    try {
      const res = await approvalsApi.saveRoute(type.key, route);
      setLoaded(res.data.route);
      setRoute(editable(res.data.route));
      message.success(t('approvals.routes.saved'));
      onSaved?.();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    try {
      const res = await approvalsApi.resetRoute(type.key);
      setLoaded(res.data.route);
      setRoute(editable(res.data.route));
      message.success(t('approvals.routes.resetDone'));
      onSaved?.();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  return (
    <div className="apr-editor">
      <div className="apr-editor__main">
        <div className="apr-editor__head">
          <div>
            <h3>{tr(type.title, locale)}</h3>
            <span className="apr-editor__state">
              {loaded?.saved ? t('approvals.routes.custom') : loaded?.fallback ? t('approvals.routes.fallback') : t('approvals.routes.moduleDefault')}
            </span>
          </div>
          <div className="apr-editor__buttons">
            {loaded?.saved && (
              <Popconfirm title={t('approvals.routes.resetConfirm')} onConfirm={reset} okText={t('approvals.routes.reset')} cancelText={t('common.cancel')}>
                <Button>{t('approvals.routes.reset')}</Button>
              </Popconfirm>
            )}
            <Button onClick={() => setRoute(editable(loaded))} disabled={!dirty}>
              {t('common.discard')}
            </Button>
            <Button type="primary" onClick={save} loading={saving} disabled={!dirty || !route.stages.length}>
              {t('common.save')}
            </Button>
          </div>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) return;
            setRoute((prev) => {
              const from = prev.stages.findIndex((s) => s.id === active.id);
              const to = prev.stages.findIndex((s) => s.id === over.id);
              return { ...prev, stages: arrayMove(prev.stages, from, to) };
            });
          }}
        >
          <SortableContext items={route.stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="apr-stages">
              {route.stages.map((stage, index) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  index={index}
                  fields={type.fields}
                  options={options}
                  onChange={(next) => setStage(index, next)}
                  onRemove={() => setRoute((prev) => ({ ...prev, stages: prev.stages.filter((_, i) => i !== index) }))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        {route.stages.length < 12 && (
          <Button type="dashed" block className="apr-add-stage" onClick={() => setRoute((prev) => ({ ...prev, stages: [...prev.stages, { id: newId(), name: '', mode: 'all', approvers: [], conditions: [] }] }))} icon={<PlusOutlined />}>
            {t('approvals.routes.addStage')}
          </Button>
        )}
        <div className="apr-editor__extra">
          <div className="apr-stage__row">
            <label>{t('approvals.routes.restartFrom')}</label>
            <Segmented
              value={route.restartFrom}
              onChange={(restartFrom) => setRoute((prev) => ({ ...prev, restartFrom }))}
              options={[
                { value: 'first', label: t('approvals.routes.restartFirst') },
                { value: 'current', label: t('approvals.routes.restartCurrent') },
              ]}
            />
          </div>
          <div className="apr-stage__row">
            <label>
              {t('approvals.routes.escalateTo')}
              <Tooltip title={t('approvals.routes.escalateHint')}>
                <span className="apr-help">?</span>
              </Tooltip>
            </label>
            <ApproverSelect value={route.escalateTo} onChange={(escalateTo) => setRoute((prev) => ({ ...prev, escalateTo }))} placeholder={t('approvals.routes.escalateDefault')} />
          </div>
        </div>
      </div>
      <Preview type={type} route={route} fields={type.fields} options={options} />
    </div>
  );
}

/** Route builder: one route per document type of every module that uses approvals. */
export default function RouteBuilder() {
  const { t, locale } = useLocale();
  const [types, setTypes] = useState(null);
  const [active, setActive] = useState(null);
  const load = () =>
    approvalsApi
      .routes()
      .then((res) => {
        setTypes(res.data.types);
        setActive((prev) => prev || res.data.types[0]?.key || null);
      })
      .catch(() => setTypes([]));
  useEffect(() => {
    load();
  }, []);
  if (!types) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!types.length) return <Empty description={<span className="apr-empty-text">{t('approvals.routes.noTypes')}</span>} />;
  const type = types.find((item) => item.key === active) || types[0];
  return (
    <div className="apr-routes">
      <nav className="apr-routes__types">
        {types.map((item) => {
          const look = MODULE_LOOK[item.module] || { color: '#64748B', icon: moduleById(item.module)?.icon || 'inbox' };
          return (
            <button key={item.key} type="button" className={`apr-type${item.key === type.key ? ' is-active' : ''}`} onClick={() => setActive(item.key)}>
              <span className="apr-row__icon" style={{ '--c': look.color }}>
                <MenuIcon name={moduleById(item.module)?.icon || look.icon} variant="mono" />
              </span>
              <span>
                <b>{tr(item.title, locale)}</b>
                <em>
                  {t('approvals.routes.stagesCount', { n: item.stages })}
                  {!item.saved ? ` · ${t('approvals.routes.byDefault')}` : ''}
                </em>
              </span>
            </button>
          );
        })}
      </nav>
      <RouteEditor key={type.key} type={type} onSaved={load} />
    </div>
  );
}
