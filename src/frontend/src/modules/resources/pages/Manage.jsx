import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App, Button, ColorPicker, Input, Modal, Popconfirm, Skeleton, Switch, Tag, Tooltip } from 'antd';
import { AppstoreAddOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { categoryName, itemText, resourcesApi } from '../api';
import { MODULE_REGISTRY } from '../../registry';
import { useSettings } from '../../../context/SettingsContext';
import AddModules from '../components/AddModules';
import ResourceIcon from '../components/ResourceIcon';
import ResourceDialog from '../components/ResourceDialog';
import { PALETTE } from '../components/IconPicker';

const VIS_ICON = { public: '🌐', signed: '🏢', custom: '👥' };

function Row({ item, categories, onEdit, onToggle }) {
  const { t, locale } = useLocale();
  const { settings } = useSettings();
  const text = itemText(item, { locale, t, settings, registry: MODULE_REGISTRY });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const category = categories.find((entry) => entry.id === item.categoryId);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`rs-row${isDragging ? ' is-dragging' : ''}${item.active ? '' : ' is-off'}`}>
      <button type="button" className="rs-row__grip" {...attributes} {...listeners} aria-label={t('resources.dragToSort')}>⋮⋮</button>
      <ResourceIcon icon={item.icon} title={text.title} size={40} />
      <button type="button" className="rs-row__text" onClick={() => onEdit(item)}>
        <strong>{text.title}</strong>
        <span>{text.host}{item.target === 'blank' ? ' ↗' : ''}{Object.keys(item.i18n || {}).length > 1 ? ' · RU / EN' : ''}</span>
      </button>
      <span className="rs-row__tags">
        {category && <Tag bordered={false} style={{ '--c': category.color }} className="rs-cat-tag"><span className="rs-chips__dot" /> {categoryName(category, locale)}</Tag>}
        <Tooltip title={item.visibility === 'custom' ? (item.access || []).map((entry) => entry.label).filter(Boolean).join(', ') : t(`resources.visibility.${item.visibility}Desc`)}>
          <Tag bordered={false} className={`rs-vis is-${item.visibility}`}>{VIS_ICON[item.visibility]} {t(`resources.visibility.${item.visibility}`)}</Tag>
        </Tooltip>
      </span>
      <Tooltip title={item.active ? t('resources.shownToAll') : t('resources.hiddenFromAll')}>
        <Switch size="small" checked={item.active} onChange={(on) => onToggle(item, on)} />
      </Tooltip>
      <Button size="small" onClick={() => onEdit(item)}>{t('common.edit')}</Button>
    </div>
  );
}

function CategoryDialog({ open, category, onClose }) {
  const { t, locale, portalDefault } = useLocale();
  const { message } = App.useApp();
  const [names, setNames] = useState({ ru: '', en: '' });
  const [color, setColor] = useState(PALETTE[0]);
  const primary = portalDefault || locale;
  const name = names[primary] || names.ru || names.en;
  useEffect(() => {
    if (open) {
      const i18n = { ru: '', en: '', ...(category?.i18n || {}) };
      if (category && !i18n[primary]) i18n[primary] = category.name;
      setNames(i18n);
      setColor(category?.color || PALETTE[16]);
    }
  }, [open, category, primary]);
  const save = async () => {
    try {
      const payload = { name: '', i18n: names, color };
      if (category) await resourcesApi.updateCategory(category.id, payload);
      else await resourcesApi.createCategory(payload);
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };
  return (
    <Modal open={open} title={category ? t('resources.editCategory') : t('resources.addCategory')} onCancel={() => onClose(false)} onOk={save} okText={t('common.save')} cancelText={t('common.cancel')} okButtonProps={{ disabled: !name.trim() }} width={460} destroyOnHidden>
      <div className="rs-cat-names">
        {['ru', 'en'].map((code) => (
          <Input
            key={code}
            autoFocus={code === primary}
            prefix={<span className="rs-cat-names__lang">{code.toUpperCase()}</span>}
            value={names[code] || ''}
            maxLength={80}
            onChange={(event) => setNames({ ...names, [code]: event.target.value })}
            onPressEnter={save}
            placeholder={code === 'ru' ? 'Например: Работа, Кадры' : 'e.g. Work, HR'}
          />
        ))}
      </div>
      <div className="rs-swatches rs-swatches--modal">
        {PALETTE.map((value) => (
          <button key={value} type="button" className={color === value ? 'is-active' : ''} style={{ background: value }} onClick={() => setColor(value)} aria-label={value} />
        ))}
        <ColorPicker value={color} onChangeComplete={(value) => setColor(value.toHexString().toUpperCase())} size="small" />
      </div>
    </Modal>
  );
}

/** /app/resources/manage — the catalogue: default order, categories, visibility. */
export default function Manage() {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => resourcesApi.admin().then((res) => setData(res.data)).catch(setError), []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (params.get('new')) {
      setDialog({ type: 'item' });
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (error) return <div className="rs-empty">{errorMessage(error)}</div>;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const items = data.items;
  const shownItems = q.trim() ? items.filter((item) => `${item.title} ${item.module || ''} ${item.url} ${JSON.stringify(item.i18n || {})}`.toLowerCase().includes(q.trim().toLowerCase())) : items;

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = items.map((item) => item.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    setData({ ...data, items: next.map((id) => items.find((item) => item.id === id)) });
    try {
      await resourcesApi.reorder(next);
    } catch (err) {
      message.error(errorMessage(err));
      load();
    }
  };

  const toggle = async (item, active) => {
    setData({ ...data, items: items.map((entry) => (entry.id === item.id ? { ...entry, active } : entry)) });
    try {
      await resourcesApi.updateItem(item.id, { active });
    } catch (err) {
      message.error(errorMessage(err));
      load();
    }
  };

  return (
    <div className="rs-manage">
      <nav className="kb-crumbs">
        <Link to="/app/resources">{t('apps.resources.name')}</Link>
        <span className="kb-crumbs__sep">/</span>
        <strong>{t('resources.manageTitle')}</strong>
      </nav>
      <header className="rs-head">
        <div className="rs-head__text">
          <h1>{t('resources.manageTitle')}</h1>
          <p>{t('resources.manageLead')}</p>
        </div>
        <div className="rs-head__actions">
          <Link to="/admin/settings/resources" tabIndex={-1}>
            <Button className="mod-act" icon={<SettingOutlined />} aria-label={t('resources.settings')} title={t('resources.settings')}>
              <span>{t('resources.settings')}</span>
            </Button>
          </Link>
          <Button className="mod-act" data-tour="rs.modules" icon={<AppstoreAddOutlined />} onClick={() => setDialog({ type: 'modules' })} aria-label={t('resources.addModules')} title={t('resources.addModules')}>
            <span>{t('resources.addModules')}</span>
          </Button>
          <Button type="primary" data-tour="rs.add" icon={<PlusOutlined />} onClick={() => setDialog({ type: 'item' })}>{t('resources.add')}</Button>
        </div>
      </header>

      <section className="rs-cats" data-tour="rs.cats">
        <span className="rs-cats__label">{t('resources.categories')}</span>
        {data.categories.map((category) => (
          <span key={category.id} className="rs-cat" style={{ '--c': category.color }}>
            <button type="button" onClick={() => setDialog({ type: 'category', category })}>
              <span className="rs-chips__dot" /> {categoryName(category, locale)}
            </button>
            <Popconfirm title={t('resources.deleteCategoryConfirm')} onConfirm={() => resourcesApi.deleteCategory(category.id).then(load)}>
              <button type="button" className="rs-cat__x" aria-label={t('common.delete')}>✕</button>
            </Popconfirm>
          </span>
        ))}
        <button type="button" className="rs-cat is-add" onClick={() => setDialog({ type: 'category' })}><PlusOutlined /> {t('resources.addCategory')}</button>
      </section>

      {items.length > 6 && (
        <Input allowClear className="rs-manage__search" placeholder={t('resources.search')} value={q} onChange={(event) => setQ(event.target.value)} />
      )}

      {!items.length ? (
        <div className="rs-empty">
          <strong>{t('resources.emptyAdmin')}</strong>
          <Button type="primary" onClick={() => setDialog({ type: 'item' })} icon={<PlusOutlined />}>{t('resources.add')}</Button>
        </div>
      ) : (
        <>
          <p className="rs-manage__hint">{t('resources.orderHint')}</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={shownItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <div className="rs-rows">
                {shownItems.map((item) => (
                  <Row key={item.id} item={item} categories={data.categories} onEdit={(entry) => setDialog({ type: 'item', item: entry })} onToggle={toggle} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <ResourceDialog
        open={dialog?.type === 'item'}
        item={dialog?.item}
        categories={data.categories}
        onClose={(saved) => {
          setDialog(null);
          if (saved) load();
        }}
      />
      <AddModules
        open={dialog?.type === 'modules'}
        items={items}
        onClose={(added) => {
          setDialog(null);
          if (added) load();
        }}
      />
      <CategoryDialog
        open={dialog?.type === 'category'}
        category={dialog?.category}
        onClose={(saved) => {
          setDialog(null);
          if (saved) load();
        }}
      />
    </div>
  );
}
