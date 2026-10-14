import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Dropdown, Skeleton } from 'antd';
import { CheckOutlined, DownOutlined, EditOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import Chrome from '../../components/Chrome';
import AppFooter from '../../components/AppFooter';
import { MenuIcon } from '../../components/icons/menuIcons';
import { useLocale } from '../../context/LocaleContext';
import { useSettings } from '../../context/SettingsContext';
import { errorMessage } from '../../lib/errors';
import { intlOptions } from '../../lib/datetime';
import { dashboardApi, uid } from './api';
import { WIDGET_CATALOG, withDefaults } from './catalog';
import { OptionsProvider } from './options';
import WidgetFrame, { widgetTitle } from './components/WidgetFrame';
import WidgetSettings from './components/WidgetSettings';
import Gallery from './components/Gallery';
import { cap, localeTag } from './widgets/common';
import '../kb/kb.css';
import '../files/files.css';
import '../drive/drive.css';
import '../resources/resources.css';
import './dashboard.css';

const SAVE_DELAY = 600;
// Others keep their places while one is dragged; the grid itself reflows.
const keepInPlace = () => null;

/** One widget failing never takes the page down. */
class WidgetBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <div className="dw-empty is-error"><span className="dw-empty__icon">!</span><strong>{this.props.label}</strong></div>;
    return this.props.children;
  }
}

/** Columns for the page width: 12 on desktops, 6 on tablets, 1 on phones. */
function useColumns(node) {
  const [cols, setCols] = useState(12);
  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      // A grid being swapped out reports 0: keep the last value.
      if (width > 0) setCols(width >= 1060 ? 12 : width >= 640 ? 6 : 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return cols;
}

function spanOf(widget, cols) {
  const def = WIDGET_CATALOG[widget.type];
  if (cols === 1) return { w: 1, h: Math.max(widget.h, def.size.minH || 2, 3) };
  if (cols === 6) return { w: Math.min(6, Math.max(2, Math.round(widget.w / 2))), h: widget.h };
  return { w: Math.min(12, widget.w), h: widget.h };
}

function GridItem({ widget, cols, editing, canEdit, flash, resizing, onSettings, onRemove, onResize, onDuplicate, onResizeStart, onChangeSettings }) {
  const { t } = useLocale();
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({ id: widget.id, disabled: !editing });
  const def = WIDGET_CATALOG[widget.type];
  const span = spanOf(widget, cols);
  const Widget = def.Component;
  const settings = useMemo(() => withDefaults(widget.type, widget.settings), [widget.type, widget.settings]);
  const size = { w: cols === 1 ? 4 : cols === 6 ? span.w * 2 : span.w, h: span.h, cols };
  return (
    <div
      ref={setNodeRef}
      className={`dash-item${isDragging ? ' is-placeholder' : ''}${flash ? ' is-new' : ''}`}
      style={
        cols === 1
          ? { height: def.autoHeight ? 'auto' : `calc(${span.h} * var(--dash-row) + ${span.h - 1} * var(--dash-gap))` }
          : { gridColumn: `span ${span.w}`, gridRow: `span ${span.h}` }
      }
      data-widget={widget.type}
    >
      <WidgetFrame
        widget={widget}
        editing={editing}
        canEdit={canEdit}
        resizing={resizing}
        dragHandle={{ ...attributes, ...listeners }}
        onSettings={onSettings}
        onRemove={onRemove}
        onResize={onResize}
        onDuplicate={onDuplicate}
        onResizeStart={cols > 1 ? onResizeStart : undefined}
      >
        <WidgetBoundary label={t('dashboard.widgetFailed')}>
          <Widget widget={{ ...widget, settings }} size={size} onSettings={onChangeSettings} />
        </WidgetBoundary>
      </WidgetFrame>
    </div>
  );
}

function Dashboard() {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const { settings } = useSettings();
  const [meta, setMeta] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [settingsFor, setSettingsFor] = useState(null);
  const [status, setStatus] = useState('idle');
  const [activeId, setActiveId] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [error, setError] = useState(null);
  const gridRef = useRef(null);
  const [gridNode, setGridNode] = useState(null);
  const latest = useRef([]);
  const timer = useRef(null);
  const cols = useColumns(gridNode);
  const attachGrid = useCallback((node) => {
    gridRef.current = node;
    if (node) setGridNode(node);
  }, []);

  const load = useCallback(() => {
    dashboardApi
      .load()
      .then((res) => {
        setMeta(res.data);
        setWidgets(res.data.widgets);
        latest.current = res.data.widgets;
        setError(null);
      })
      .catch(setError);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    (next) => {
      clearTimeout(timer.current);
      setStatus('saving');
      timer.current = setTimeout(() => {
        dashboardApi
          .save(next)
          .then(() => setStatus('saved'))
          .catch((err) => {
            setStatus('error');
            message.error(errorMessage(err));
          });
      }, SAVE_DELAY);
    },
    [message]
  );

  /** Replaces the layout on screen and saves it (debounced). */
  const commit = useCallback(
    (next) => {
      latest.current = next;
      setWidgets(next);
      save(next);
    },
    [save]
  );
  const patch = (id, change) => commit(latest.current.map((widget) => (widget.id === id ? { ...widget, ...change } : widget)));

  const add = (type) => {
    const def = WIDGET_CATALOG[type];
    const widget = { id: uid(), type, w: def.size.w, h: def.size.h, settings: withDefaults(type, {}) };
    commit([widget, ...latest.current]);
    setGallery(false);
    setFlashId(widget.id);
    setTimeout(() => setFlashId(null), 1600);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = (widget) => {
    const before = latest.current;
    commit(before.filter((item) => item.id !== widget.id));
    message.open({
      type: 'info',
      content: (
        <span className="dash-undo">
          {t('dashboard.removed', { name: widgetTitle(widget, t) })}
          <button type="button" onClick={() => { commit(before); message.destroy('dash-undo'); }}>{t('dashboard.undo')}</button>
        </span>
      ),
      key: 'dash-undo',
      duration: 5,
    });
  };

  const duplicate = (widget) => {
    const index = latest.current.findIndex((item) => item.id === widget.id);
    const copy = { ...widget, id: uid(), settings: { ...widget.settings } };
    const next = [...latest.current];
    next.splice(index + 1, 0, copy);
    commit(next);
  };

  // Resize by dragging the corner: snaps to whole columns and rows.
  const startResize = (widget, event) => {
    event.preventDefault();
    event.stopPropagation();
    const grid = gridRef.current;
    const style = getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 16;
    const rowH = parseFloat(style.gridAutoRows) || 56;
    const colW = (grid.getBoundingClientRect().width - gap * (cols - 1)) / cols;
    const unit = 12 / cols;
    const def = WIDGET_CATALOG[widget.type].size;
    const start = { x: event.clientX, y: event.clientY, span: spanOf(widget, cols) };
    setResizingId(widget.id);
    const move = (moveEvent) => {
      const dw = Math.round((moveEvent.clientX - start.x) / (colW + gap));
      const dh = Math.round((moveEvent.clientY - start.y) / (rowH + gap));
      const w = Math.min(12, Math.max(def.minW || 2, (start.span.w + dw) * unit));
      const h = Math.min(def.maxH || 12, Math.max(def.minH || 2, start.span.h + dh));
      const next = latest.current.map((item) => (item.id === widget.id ? { ...item, w, h } : item));
      latest.current = next;
      setWidgets(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setResizingId(null);
      save(latest.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragOver = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = latest.current.map((widget) => widget.id);
    const next = arrayMove(latest.current, ids.indexOf(active.id), ids.indexOf(over.id));
    latest.current = next;
    setWidgets(next);
  };
  const onDragEnd = () => {
    setActiveId(null);
    save(latest.current);
  };

  const resetMine = () =>
    modal.confirm({
      title: t('dashboard.resetTitle'),
      content: t('dashboard.resetText'),
      okText: t('dashboard.reset'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        clearTimeout(timer.current);
        await dashboardApi.reset();
        setStatus('idle');
        load();
      },
    });

  const adminMenu = meta?.canManage && {
    items: [
      {
        key: 'default',
        label: t('dashboard.admin.makeDefault'),
        onClick: () =>
          modal.confirm({
            title: t('dashboard.admin.makeDefaultTitle'),
            content: t('dashboard.admin.makeDefaultText'),
            okText: t('dashboard.admin.makeDefault'),
            cancelText: t('common.cancel'),
            onOk: () => dashboardApi.saveDefault(latest.current).then(() => message.success(t('dashboard.admin.saved'))),
          }),
      },
      meta.defaultIsCustom && {
        key: 'builtin',
        label: t('dashboard.admin.builtin'),
        onClick: () => dashboardApi.resetDefault().then(() => message.success(t('dashboard.admin.restored'))),
      },
    ].filter(Boolean),
  };

  const canEdit = Boolean(meta?.canPersonalize);
  const title = settings?.modules?.dashboard?.settings?.title || t('apps.dashboard.name');
  const active = widgets.find((widget) => widget.id === activeId);

  if (error) return <div className="dw-empty is-error"><strong>{errorMessage(error)}</strong></div>;

  return (
    <div className={`dash${editing ? ' is-editing' : ''}`}>
      <header className="dash-head">
        <div className="dash-head__title">
          <h1>{title}</h1>
          <p>{cap(new Date().toLocaleDateString(localeTag(locale), intlOptions({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })))}</p>
        </div>
        {canEdit && (
          <div className="dash-head__actions">
            {editing ? (
              <>
                <span className={`dash-status is-${status}`}>{status === 'idle' ? t('dashboard.editHint') : t(`dashboard.saveStatus.${status}`)}</span>
                <Button className="mod-act" onClick={resetMine} icon={<UndoOutlined />} aria-label={t('dashboard.reset')} title={t('dashboard.reset')}>
                  <span>{t('dashboard.reset')}</span>
                </Button>
                {adminMenu && (
                  <Dropdown menu={adminMenu} trigger={['click']}>
                    <Button icon={<DownOutlined />} iconPosition="end">{t('dashboard.admin.menu')}</Button>
                  </Dropdown>
                )}
                <Button className="mod-act" onClick={() => setGallery(true)} icon={<PlusOutlined />} aria-label={t('dashboard.addWidget')} title={t('dashboard.addWidget')}>
                  <span>{t('dashboard.addWidget')}</span>
                </Button>
                <Button type="primary" onClick={() => setEditing(false)} icon={<CheckOutlined />}>
                  {t('dashboard.done')}
                </Button>
              </>
            ) : (
              <>
                <Button className="mod-act" onClick={() => setGallery(true)} icon={<PlusOutlined />} aria-label={t('dashboard.addWidget')} title={t('dashboard.addWidget')}>
                  <span>{t('dashboard.addWidget')}</span>
                </Button>
                <Button type="primary" onClick={() => setEditing(true)} icon={<EditOutlined />}>
                  {t('dashboard.customize')}
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      {editing && <div className="dash-editbar">{t('dashboard.editBar')}</div>}

      {!meta ? (
        <div className="dash-grid is-loading" ref={attachGrid}>
          {[8, 4, 5, 4, 3].map((w, i) => (
            <div key={i} className="dash-item" style={{ gridColumn: `span ${cols === 12 ? w : cols}`, gridRow: 'span 4' }}>
              <div className="dash-card"><Skeleton active paragraph={{ rows: 4 }} /></div>
            </div>
          ))}
        </div>
      ) : !widgets.length ? (
        <div className="dash-empty" ref={attachGrid}>
          <div className="dash-empty__art" aria-hidden>
            {['#6366F1', '#10B981', '#F97316', '#0EA5E9'].map((color, i) => <span key={color} style={{ '--c': color, '--i': i }} />)}
          </div>
          <h2>{t('dashboard.emptyTitle')}</h2>
          <p>{t('dashboard.emptyText')}</p>
          {canEdit && (
            <div className="dash-empty__actions">
              <Button type="primary" size="large" onClick={() => setGallery(true)} icon={<PlusOutlined />}>{t('dashboard.addWidget')}</Button>
              <Button size="large" onClick={resetMine}>{t('dashboard.restore')}</Button>
            </div>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active: item }) => setActiveId(item.id)} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragEnd}>
          <SortableContext items={widgets.map((widget) => widget.id)} strategy={keepInPlace}>
            <div className={`dash-grid${cols === 1 ? ' is-single' : ''}`} ref={attachGrid} style={{ '--cols': cols }}>
              {widgets.map((widget) => (
                <GridItem
                  key={widget.id}
                  widget={widget}
                  cols={cols}
                  editing={editing}
                  canEdit={canEdit}
                  flash={flashId === widget.id}
                  resizing={resizingId === widget.id}
                  onSettings={() => setSettingsFor(widget)}
                  onRemove={() => remove(widget)}
                  onResize={(preset) => patch(widget.id, { w: Math.max(preset.w, WIDGET_CATALOG[widget.type].size.minW || 2), h: Math.max(preset.h, WIDGET_CATALOG[widget.type].size.minH || 2) })}
                  onDuplicate={() => duplicate(widget)}
                  onResizeStart={(event) => startResize(widget, event)}
                  onChangeSettings={(change) => patch(widget.id, { settings: { ...widget.settings, ...change } })}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 180 }}>
            {active ? (
              <div className="dash-ghost" style={{ '--w-accent': WIDGET_CATALOG[active.type].color }}>
                <span className="dash-card__icon">
                  <MenuIcon name={WIDGET_CATALOG[active.type].icon} variant="mono" />
                </span>
                {widgetTitle(active, t)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {meta && <Gallery open={gallery} available={meta.available} onAdd={add} onClose={() => setGallery(false)} />}
      {settingsFor && (
        <WidgetSettings
          widget={settingsFor}
          onClose={(values) => {
            if (values) patch(settingsFor.id, { settings: values });
            setSettingsFor(null);
          }}
        />
      )}
    </div>
  );
}

/** /app/dashboard — personal widgets over the portal's modules. */
export default function DashboardApp() {
  return (
    <div className="shell">
      <Chrome />
      <main className="dash-shell">
        <OptionsProvider>
          <Dashboard />
        </OptionsProvider>
      </main>
      <AppFooter />
    </div>
  );
}
