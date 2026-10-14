import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { App, Button, Input, Modal, Popover, Select, Skeleton, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { ColorSwatches, PALETTE } from '../../shared/People';
import { crmApi } from '../api';
import { useCrm } from '../CrmContext';
import { errorCode, inkOn } from '../lib';
import { Glyph } from '../components/bits';

let tmp = 0;
const tempKey = () => `n${++tmp}`;

function Handle(props) {
  return (
    <button type="button" className="pl-handle" {...props}>
      <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
        {[3, 8, 13].map((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
      </svg>
    </button>
  );
}

function ColorDot({ value, onChange, label }) {
  return (
    <Popover trigger="click" content={<ColorSwatches value={value} onChange={onChange} small />} placement="bottomLeft">
      <button type="button" className="pl-color" style={{ background: value }} aria-label={label} />
    </Popover>
  );
}

function StageRow({ stage, onChange, onRemove, count, fixed }) {
  const { t } = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.key, disabled: fixed });
  return (
    <div ref={setNodeRef} className={`pl-stage${isDragging ? ' is-dragging' : ''}${fixed ? ` is-${stage.kind}` : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {fixed ? <span className="pl-handle is-fixed"><Glyph name={stage.kind === 'won' ? 'trophy' : 'close'} size={13} /></span> : <Handle {...attributes} {...listeners} aria-label={t('crm.pipelines.drag', { name: stage.name })} />}
      <ColorDot value={stage.color} onChange={(color) => onChange({ color })} label={t('crm.pipelines.color')} />
      <Input value={stage.name} onChange={(event) => onChange({ name: event.target.value })} maxLength={60} aria-label={t('crm.pipelines.stageName')} status={stage.name.trim() ? undefined : 'error'} />
      <span className="pl-stage__preview" style={{ '--c': stage.color, '--ink': inkOn(stage.color) }}>{stage.name || '…'}</span>
      {count > 0 && <Tooltip title={t('crm.pipelines.dealsIn', { n: count })}><span className="pl-stage__count">{count}</span></Tooltip>}
      {fixed ? (
        <span className="pl-stage__kind">{t(`crm.pipelines.kind.${stage.kind}`)}</span>
      ) : (
        <Tooltip title={t('crm.pipelines.removeStage')}>
          <button type="button" className="pl-x" onClick={onRemove} aria-label={t('crm.pipelines.removeStage')}>
            <Glyph name="trash" size={14} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function SortablePipeline({ pipeline, active, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `p${pipeline.id}` });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`pl-item${active ? ' is-active' : ''}`}>
      <Handle {...attributes} {...listeners} aria-label={pipeline.name} />
      <button type="button" className="pl-item__main" onClick={() => onSelect(pipeline.id)}>
        <span className="mod-dot" style={{ '--c': pipeline.color }} />
        <span className="pl-item__name">{pipeline.name}</span>
        {pipeline.isDefault && <span className="mod-pill">★</span>}
        <span className="pl-item__count">{pipeline.counts?.open ?? ''}</span>
      </button>
    </div>
  );
}

/** Editor of one pipeline: name, colour, stages (drag to reorder), won / lost fixed at the end. */
function PipelineEditor({ pipeline, onSaved, onDeleted, canDelete, others }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [name, setName] = useState(pipeline.name);
  const [color, setColor] = useState(pipeline.color || PALETTE[0]);
  const [stages, setStages] = useState(() => pipeline.stages.map((stage) => ({ ...stage, key: `s${stage.id}` })));
  const [counts, setCounts] = useState({});
  const [moves, setMoves] = useState({});
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    crmApi
      .board({ pipeline: pipeline.id, group: 'all', limit: 1 })
      .then((res) => setCounts(Object.fromEntries((res.data.stages || []).map((stage) => [stage.id, stage.count || 0]))))
      .catch(() => {});
  }, [pipeline.id]);

  const open = stages.filter((stage) => stage.kind === 'open');
  const closed = stages.filter((stage) => stage.kind !== 'open').sort((a, b) => (a.kind === 'won' ? 0 : 1) - (b.kind === 'won' ? 0 : 1));
  const dirty = useMemo(
    () => name !== pipeline.name || color !== pipeline.color || JSON.stringify(stages.map(({ id, name: n, color: c, kind }) => [id, n, c, kind])) !== JSON.stringify(pipeline.stages.map(({ id, name: n, color: c, kind }) => [id, n, c, kind])),
    [name, color, stages, pipeline]
  );

  const update = (key, patch) => setStages((list) => list.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)));

  const remove = (stage) => {
    if (open.length <= 1) {
      message.warning(t('crm.pipelines.lastStage'));
      return;
    }
    if (stage.id && counts[stage.id] > 0) {
      setRemoving({ stage, target: open.find((item) => item.key !== stage.key)?.id });
      return;
    }
    setStages((list) => list.filter((item) => item.key !== stage.key));
  };

  const confirmRemove = () => {
    const { stage, target } = removing;
    setMoves((prev) => ({ ...prev, [stage.id]: target }));
    setStages((list) => list.filter((item) => item.key !== stage.key));
    setRemoving(null);
  };

  const save = async () => {
    if (!name.trim() || stages.some((stage) => !stage.name.trim())) {
      message.warning(t('crm.pipelines.namesRequired'));
      return;
    }
    setSaving(true);
    try {
      const ordered = [...open, ...closed].map(({ id, name: n, color: c, kind }) => ({ ...(id ? { id } : {}), name: n.trim(), color: c, kind }));
      const payload = { name: name.trim(), color, stages: ordered };
      // Deals of removed stages: { removedStageId: targetStageId }.
      if (Object.keys(moves).length) payload.moveTo = moves;
      await crmApi.updatePipeline(pipeline.id, payload);
      setMoves({});
      message.success(t('common.saved'));
      onSaved();
    } catch (err) {
      message.error(errorCode(err) === 'STAGE_HAS_DEALS' ? t('crm.pipelines.stageHasDeals') : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = open.findIndex((stage) => stage.key === active.id);
    const to = open.findIndex((stage) => stage.key === over.id);
    if (from < 0 || to < 0) return;
    setStages([...arrayMove(open, from, to), ...closed]);
  };

  return (
    <section className="pl-editor">
      <div className="pl-editor__head">
        <ColorDot value={color} onChange={setColor} label={t('crm.pipelines.color')} />
        <Input className="pl-editor__name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} aria-label={t('crm.pipelines.name')} variant="borderless" />
        {canDelete && (
          <Button danger type="text" onClick={() => setDeleting({ target: others[0]?.id })}>
            {t('crm.pipelines.delete')}
          </Button>
        )}
      </div>
      <div className="pl-preview" aria-hidden="true">
        {[...open, ...closed].map((stage) => (
          <span key={stage.key} className={`crm-plate is-${stage.kind}`} style={{ '--c': stage.color, '--ink': inkOn(stage.color) }}>
            <span className="crm-plate__name">{stage.name || '…'}</span>
          </span>
        ))}
      </div>
      <div className="pl-label">{t('crm.pipelines.stages')}</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={open.map((stage) => stage.key)} strategy={verticalListSortingStrategy}>
          <div className="pl-stages">
            {open.map((stage) => (
              <StageRow key={stage.key} stage={stage} count={counts[stage.id]} onChange={(patch) => update(stage.key, patch)} onRemove={() => remove(stage)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button type="dashed" block className="pl-add" onClick={() => setStages([...open, { key: tempKey(), name: '', color: PALETTE[(open.length + 2) % PALETTE.length], kind: 'open' }, ...closed])} icon={<PlusOutlined />}>
        {t('crm.pipelines.addStage')}
      </Button>
      <div className="pl-label">{t('crm.pipelines.final')}</div>
      <div className="pl-stages">
        {closed.map((stage) => (
          <StageRow key={stage.key} stage={stage} fixed count={counts[stage.id]} onChange={(patch) => update(stage.key, patch)} />
        ))}
      </div>
      <div className="pl-foot">
        <Button type="primary" disabled={!dirty} loading={saving} onClick={save}>{t('common.save')}</Button>
        <Button disabled={!dirty || saving} onClick={() => { setName(pipeline.name); setColor(pipeline.color); setStages(pipeline.stages.map((stage) => ({ ...stage, key: `s${stage.id}` }))); setMoves({}); }}>{t('common.discard')}</Button>
      </div>
      <Modal
        open={Boolean(deleting)}
        title={t('crm.pipelines.deleteConfirm', { name: pipeline.name })}
        okText={t('common.delete')}
        okButtonProps={{ danger: true, disabled: Object.values(counts).reduce((sum, n) => sum + n, 0) > 0 && !deleting?.target }}
        cancelText={t('common.cancel')}
        onCancel={() => setDeleting(null)}
        onOk={async () => {
          try {
            await crmApi.deletePipeline(pipeline.id, Object.values(counts).reduce((sum, n) => sum + n, 0) > 0 ? deleting.target : undefined);
            setDeleting(null);
            onDeleted();
          } catch (err) {
            message.error(errorMessage(err));
          }
        }}
        width={440}
        destroyOnHidden
      >
        {Object.values(counts).reduce((sum, n) => sum + n, 0) > 0 ? (
          <>
            <p className="dialog-lead">{t('crm.pipelines.deleteMove', { n: Object.values(counts).reduce((sum, n) => sum + n, 0) })}</p>
            <Select style={{ width: '100%' }} value={deleting?.target} onChange={(target) => setDeleting({ target })} options={others.map((item) => ({ value: item.id, label: item.name }))} />
          </>
        ) : (
          <p className="dialog-lead">{t('crm.pipelines.deleteText')}</p>
        )}
      </Modal>
      <Modal open={Boolean(removing)} title={t('crm.pipelines.moveTitle', { name: removing?.stage.name })} okText={t('crm.pipelines.moveOk')} cancelText={t('common.cancel')} onOk={confirmRemove} onCancel={() => setRemoving(null)} okButtonProps={{ disabled: !removing?.target }} width={420} destroyOnHidden>
        <p className="dialog-lead">{t('crm.pipelines.moveLead', { n: counts[removing?.stage.id] || 0 })}</p>
        <Select
          style={{ width: '100%' }}
          value={removing?.target}
          onChange={(target) => setRemoving((prev) => ({ ...prev, target }))}
          options={stages.filter((stage) => stage.id && stage.key !== removing?.stage.key).map((stage) => ({ value: stage.id, label: <span className="status-option"><span className="status-pip" style={{ '--c': stage.color }} />{stage.name}</span> }))}
        />
      </Modal>
    </section>
  );
}

/** /app/crm/pipelines — CRM admins edit pipelines and their stages. */
export default function PipelinesPage() {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { pipelines: initial, canAdmin, refresh } = useCrm();
  const [pipelines, setPipelines] = useState(initial);
  const [selected, setSelected] = useState(initial[0]?.id);
  const [creating, setCreating] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    setPipelines(initial);
    if (!initial.some((item) => item.id === selected)) setSelected(initial[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  if (!canAdmin) return <Navigate to="/app/crm" replace />;
  const current = pipelines.find((item) => item.id === selected);

  const create = async () => {
    if (!creating?.trim()) return;
    try {
      const res = await crmApi.createPipeline({ name: creating.trim(), color: PALETTE[pipelines.length % PALETTE.length] });
      const created = res.data.pipeline || res.data;
      setCreating(null);
      await refresh();
      setSelected(created.id);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = pipelines.findIndex((item) => `p${item.id}` === active.id);
    const to = pipelines.findIndex((item) => `p${item.id}` === over.id);
    const next = arrayMove(pipelines, from, to);
    setPipelines(next);
    try {
      await crmApi.orderPipelines(next.map((item) => item.id));
      refresh();
    } catch (err) {
      setPipelines(pipelines);
      message.error(errorMessage(err));
    }
  };

  return (
    <div className="crm-page crm-page--narrow">
      <header className="crm-head">
        <div>
          <h1>{t('crm.pipelines.title')}</h1>
          <p>{t('crm.pipelines.lead')}</p>
        </div>
        <Button type="primary" onClick={() => setCreating('')} icon={<PlusOutlined />}>{t('crm.pipelines.new')}</Button>
      </header>
      <div className="pl-layout">
        <aside className="pl-list">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pipelines.map((item) => `p${item.id}`)} strategy={verticalListSortingStrategy}>
              {pipelines.map((pipeline) => (
                <SortablePipeline key={pipeline.id} pipeline={pipeline} active={pipeline.id === selected} onSelect={setSelected} />
              ))}
            </SortableContext>
          </DndContext>
          {!pipelines.length && <Skeleton active paragraph={{ rows: 3 }} />}
        </aside>
        {current && <PipelineEditor key={`${current.id}-${JSON.stringify(current.stages)}`} pipeline={current} canDelete={pipelines.length > 1} others={pipelines.filter((item) => item.id !== current.id)} onSaved={refresh} onDeleted={() => { refresh(); message.success(t('crm.pipelines.deleted')); }} />}
      </div>
      <Modal open={creating !== null} title={t('crm.pipelines.new')} okText={t('common.create')} cancelText={t('common.cancel')} onOk={create} onCancel={() => setCreating(null)} okButtonProps={{ disabled: !creating?.trim() }} width={400} destroyOnHidden>
        <p className="dialog-lead">{t('crm.pipelines.newLead')}</p>
        <Input autoFocus value={creating || ''} onChange={(event) => setCreating(event.target.value)} onPressEnter={create} maxLength={80} placeholder={t('crm.pipelines.namePlaceholder')} />
      </Modal>
    </div>
  );
}
