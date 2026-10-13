import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Checkbox, Input, Select, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { Glyph } from '../components/bits';

export const FIELD_TYPES = ['text', 'textarea', 'number', 'money', 'date', 'select', 'multiselect', 'bool', 'url', 'user'];
export const MOVABLE_BUILTINS = ['owner', 'watchers', 'close_date', 'source', 'comment'];

let seq = 0;
const uid = () => `tmp${Date.now().toString(36)}${(seq += 1)}`;

function Grip(props) {
  return (
    <button type="button" className="pl-handle" {...props}>
      <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
        {[3, 8, 13].map((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
      </svg>
    </button>
  );
}

function useDnd() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
}

/** The list keeps a stable client id per row (`_id`) for drag and drop; it is not saved. */
const withIds = (list) => (list || []).map((item) => (item._id ? item : { ...item, _id: item.key || uid() }));
const strip = (list) => list.map(({ _id, ...item }) => item);

function SectionRow({ section, onChange, onRemove, fixed }) {
  const { t } = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section._id });
  return (
    <div ref={setNodeRef} className="cs-row" style={{ transform: CSS.Transform.toString(transform), transition }}>
      <Grip {...attributes} {...listeners} aria-label={t('crmSettings.drag')} />
      <Input value={section.title} onChange={(event) => onChange({ title: event.target.value })} maxLength={60} placeholder={t('crmSettings.sectionTitle')} status={section.title?.trim() ? undefined : 'error'} />
      {fixed ? (
        <Tooltip title={t('crmSettings.aboutFixed')}>
          <span className="cs-lock">🔒</span>
        </Tooltip>
      ) : (
        <Button type="text" onClick={onRemove} aria-label={t('common.delete')} icon={<Glyph name="trash" size={14} />} />
      )}
    </div>
  );
}

/** Sections of the deal card: «О сделке» always stays (built-in fields live there). */
export function SectionsEditor({ value, onChange }) {
  const { t } = useLocale();
  const sensors = useDnd();
  const list = withIds(value);
  const update = (id, patch) => onChange(list.map((item) => (item._id === id ? { ...item, ...patch } : item)));
  return (
    <div className="cs-list">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          onChange(arrayMove(list, list.findIndex((item) => item._id === active.id), list.findIndex((item) => item._id === over.id)));
        }}
      >
        <SortableContext items={list.map((item) => item._id)} strategy={verticalListSortingStrategy}>
          {list.map((section) => (
            <SectionRow key={section._id} section={section} fixed={section.key === 'about'} onChange={(patch) => update(section._id, patch)} onRemove={() => onChange(list.filter((item) => item._id !== section._id))} />
          ))}
        </SortableContext>
      </DndContext>
      {list.length < 12 && (
        <Button type="dashed" size="small" onClick={() => onChange([...list, { _id: uid(), title: '' }])}>
          + {t('crmSettings.addSection')}
        </Button>
      )}
    </div>
  );
}

function FieldRow({ field, sections, onChange, onRemove }) {
  const { t } = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field._id });
  const hasOptions = field.type === 'select' || field.type === 'multiselect';
  return (
    <div ref={setNodeRef} className={`cs-field${isDragging ? ' is-dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <Grip {...attributes} {...listeners} aria-label={t('crmSettings.drag')} />
      <div className="cs-field__grid">
        <Input value={field.label} onChange={(event) => onChange({ label: event.target.value })} maxLength={60} placeholder={t('crmSettings.fieldLabel')} status={field.label?.trim() ? undefined : 'error'} aria-label={t('crmSettings.fieldLabel')} />
        <Select value={field.type || 'text'} onChange={(type) => onChange({ type })} options={FIELD_TYPES.map((type) => ({ value: type, label: t(`crmSettings.types.${type}`) }))} aria-label={t('crmSettings.fieldType')} />
        <Select value={field.section || 'about'} onChange={(section) => onChange({ section })} options={sections.map((section) => ({ value: section.key || section._id, label: section.title || '…', disabled: !section.key }))} aria-label={t('crmSettings.fieldSection')} />
        <div className="cs-field__flags">
          <Checkbox checked={Boolean(field.listColumn)} onChange={(event) => onChange({ listColumn: event.target.checked })}>{t('crmSettings.listColumn')}</Checkbox>
          <Checkbox checked={Boolean(field.required)} onChange={(event) => onChange({ required: event.target.checked })}>{t('crmSettings.required')}</Checkbox>
        </div>
        {hasOptions && (
          <Select className="cs-field__options" mode="tags" value={field.options || []} onChange={(options) => onChange({ options })} placeholder={t('crmSettings.options')} tokenSeparators={[';']} open={false} suffixIcon={null} aria-label={t('crmSettings.options')} />
        )}
      </div>
      <div className="cs-field__side">
        {field.key && <code className="cs-key">{field.key}</code>}
        <Button type="text" onClick={onRemove} aria-label={t('common.delete')} icon={<Glyph name="trash" size={14} />} />
      </div>
    </div>
  );
}

/** Custom fields of deals: label, type, options, section, list column, required; drag to reorder. */
export function FieldsEditor({ value, onChange, sections }) {
  const { t } = useLocale();
  const sensors = useDnd();
  const list = withIds(value);
  const update = (id, patch) => onChange(list.map((item) => (item._id === id ? { ...item, ...patch } : item)));
  return (
    <div className="cs-list">
      {!list.length && <div className="cs-empty">{t('crmSettings.noFields')}</div>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          onChange(arrayMove(list, list.findIndex((item) => item._id === active.id), list.findIndex((item) => item._id === over.id)));
        }}
      >
        <SortableContext items={list.map((item) => item._id)} strategy={verticalListSortingStrategy}>
          {list.map((field) => (
            <FieldRow key={field._id} field={field} sections={sections || []} onChange={(patch) => update(field._id, patch)} onRemove={() => onChange(list.filter((item) => item._id !== field._id))} />
          ))}
        </SortableContext>
      </DndContext>
      {list.length < 80 && (
        <Button type="dashed" size="small" onClick={() => onChange([...list, { _id: uid(), label: '', type: 'text', section: 'about', options: [], listColumn: false, required: false }])}>
          + {t('crmSettings.addField')}
        </Button>
      )}
    </div>
  );
}

export { strip };
