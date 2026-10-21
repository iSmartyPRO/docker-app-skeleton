import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { App, Button, Dropdown, Switch, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, HolderOutlined, LockOutlined, MoreOutlined, PlusOutlined, RollbackOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import ModuleHeader from '../../shared/ModuleHeader';
import { qrApi, templateText } from '../api';
import QrCode from '../components/QrCode';
import { useQr } from '../QrContext';

const SAMPLE = 'https://example.com/welcome';

function TemplateCard({ template, onEdit, onDefault, onToggle, onDelete }) {
  const { t, locale } = useLocale();
  const text = templateText(template, locale);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template.id });
  const locks = Object.keys(template.locks).filter((key) => template.locks[key]);
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`qr-tcard${isDragging ? ' is-dragging' : ''}${template.active ? '' : ' is-off'}`}>
      <button type="button" className="qr-tcard__grip" aria-label={t('qr.templates.drag')} {...attributes} {...listeners}>
        <HolderOutlined />
      </button>
      <button type="button" className="qr-tcard__thumb" onClick={() => onEdit(template)} aria-label={text.name}>
        <QrCode payload={SAMPLE} design={template.design} />
      </button>
      <div className="qr-tcard__body">
        <div className="qr-tcard__title">
          <strong>{text.name}</strong>
          {template.isDefault && (
            <Tag bordered={false} className="qr-badge is-default">
              <StarFilled /> {t('qr.templates.default')}
            </Tag>
          )}
        </div>
        <p>{text.description || '—'}</p>
        <div className="qr-tcard__tags">
          {template.presetKey && <Tag bordered={false}>{t('qr.templates.preset')}</Tag>}
          {locks.map((key) => (
            <Tag key={key} bordered={false} icon={<LockOutlined />}>
              {t(`qr.locks.${key}`)}
            </Tag>
          ))}
        </div>
        <div className="qr-tcard__foot">
          <Tooltip title={template.isDefault ? t('qr.templates.defaultCannotHide') : template.active ? t('qr.templates.shown') : t('qr.templates.hidden')}>
            <Switch size="small" checked={template.active} disabled={template.isDefault} onChange={(on) => onToggle(template, on)} />
          </Tooltip>
          <span className="qr-muted">{template.active ? t('qr.templates.shown') : t('qr.templates.hidden')}</span>
          <span className="qr-tcard__actions">
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(template)}>
              {t('common.edit')}
            </Button>
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'default', icon: <StarOutlined />, label: t('qr.templates.makeDefault'), disabled: template.isDefault, onClick: () => onDefault(template) },
                  { type: 'divider' },
                  { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('common.delete'), onClick: () => onDelete(template) },
                ],
              }}
            >
              <Button size="small" type="text" icon={<MoreOutlined />} aria-label={t('moduleHeader.more')} />
            </Dropdown>
          </span>
        </div>
      </div>
    </article>
  );
}

/** /app/qr/templates — the looks people pick from (qr.admin). */
export default function Templates() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const qr = useQr();
  const [list, setList] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const load = async () => {
    try {
      const res = await qrApi.templates();
      setList(res.data.templates);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  useEffect(() => {
    if (qr.canManage) load();
  }, [qr.canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (qr.ready && !qr.canManage) return <Navigate to="/app/qr" replace />;

  const changed = async (action) => {
    try {
      await action();
      await Promise.all([load(), qr.refresh()]);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = list.findIndex((item) => item.id === active.id);
    const to = list.findIndex((item) => item.id === over.id);
    const next = arrayMove(list, from, to);
    setList(next);
    changed(() => qrApi.reorder(next.map((item) => item.id)));
  };

  const remove = (template) =>
    modal.confirm({
      title: t('qr.templates.deleteTitle', { name: templateText(template, locale).name }),
      content: t('qr.templates.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => changed(() => qrApi.deleteTemplate(template.id)),
    });

  const restore = () =>
    changed(async () => {
      const res = await qrApi.restore();
      message.success(res.data.added ? t('qr.templates.restored', { count: res.data.added }) : t('qr.templates.nothingToRestore'));
    });

  return (
    <div className="qr-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('apps.qr.name'), to: '/app/qr' }, { key: 'templates', label: t('qr.templates.title') }]}
        icon={<MenuIcon name="qr" />}
        title={t('qr.templates.title')}
        description={t('qr.templates.lead')}
        actions={[
          { key: 'restore', icon: <RollbackOutlined />, label: t('qr.templates.restore'), onClick: restore, tooltip: t('qr.templates.restoreHint') },
          { key: 'new', primary: true, icon: <PlusOutlined />, label: t('qr.templates.create'), onClick: () => navigate('/app/qr/templates/new') },
        ]}
      />
      <p className="qr-note is-info">{t('qr.templates.howTo')}</p>
      {list && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((item) => item.id)} strategy={rectSortingStrategy}>
            <div className="qr-tgrid" data-tour="qr.templateList">
              {list.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={(item) => navigate(`/app/qr/templates/${item.id}`)}
                  onDefault={(item) => changed(() => qrApi.setDefault(item.id))}
                  onToggle={(item, active) => changed(() => qrApi.updateTemplate(item.id, { active }))}
                  onDelete={remove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
