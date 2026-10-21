import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Button, Input, Skeleton, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale } from '../../../context/LocaleContext';
import { useAuth } from '../../../context/AuthContext';
import { useSettings } from '../../../context/SettingsContext';
import { errorMessage } from '../../../lib/errors';
import TourButton from '../../../tour/TourButton';
import { arrange, categoryName, itemText, readLocalLayout, resourcesApi, writeLocalLayout } from '../api';
import { MODULE_REGISTRY } from '../../registry';
import { nowInZone } from '../../../lib/datetime';
import ResourceIcon from './ResourceIcon';
import '../resources.css';
import { firstNameOf } from '../../../lib/firstName';

function greeting(t, name) {
  const hour = nowInZone().hour();
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening';
  return t(`resources.greeting.${part}`, { name });
}

function TileBody({ item, showDescription, editing }) {
  const { t } = useLocale();
  return (
    <>
      <ResourceIcon icon={item.icon} title={item.title} size={52} />
      <span className="rs-tile__text">
        <strong>{item.title}</strong>
        {showDescription && item.description ? <span className="rs-tile__desc">{item.description}</span> : null}
        <span className="rs-tile__host">
          {item.host}
          {item.target === 'blank' && !editing && <span className="rs-tile__ext" title={t('resources.newTab')}>↗</span>}
        </span>
      </span>
    </>
  );
}

function Tile({ item, editing, showDescription, onHide, onOpenInternal }) {
  const { t } = useLocale();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !editing });
  const style = { transform: CSS.Transform.toString(transform), transition };
  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className={`rs-tile is-editing${isDragging ? ' is-dragging' : ''}`} {...attributes} {...listeners}>
        <span className="rs-tile__grip" aria-hidden="true">⋮⋮</span>
        <TileBody item={item} showDescription={showDescription} editing />
        <Tooltip title={t('resources.hide')}>
          <button
            type="button"
            className="rs-tile__hide"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={() => onHide(item)}
            aria-label={t('resources.hide')}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.4 10.4 0 0 1 12 4c5 0 9 4.5 10 8a12.6 12.6 0 0 1-3.2 4.6M6.1 6.1C3.9 7.5 2.5 9.7 2 12c1 3.5 5 8 10 8a10 10 0 0 0 4.4-1" /></svg>
          </button>
        </Tooltip>
      </div>
    );
  }
  const internal = item.url.startsWith('/') && item.target === 'self';
  return (
    <a
      ref={setNodeRef}
      className="rs-tile"
      href={item.url}
      target={item.target === 'blank' ? '_blank' : undefined}
      rel={item.target === 'blank' ? 'noopener noreferrer' : undefined}
      onClick={(event) => {
        if (internal && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          onOpenInternal(item.url);
        }
      }}
    >
      <TileBody item={item} showDescription={showDescription} />
    </a>
  );
}

/**
 * Online resources as a board of tiles. Everyone can search and filter;
 * with "Customize" people drag tiles into their own order and hide the ones
 * they do not need. Signed-in people keep their layout on the server, others
 * in this browser.
 */
export default function ResourceBoard({ variant = 'page' }) {
  const { t, locale } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [layout, setLayout] = useState(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [active, setActive] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    resourcesApi
      .board()
      .then((res) => {
        setData(res.data);
        setLayout(res.data.config.signedIn ? res.data.layout : readLocalLayout());
      })
      .catch(setError);
  }, [user?.id]);

  const persist = useCallback(
    (next) => {
      setLayout(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (data?.config.signedIn) {
          (next ? resourcesApi.saveLayout(next) : resourcesApi.resetLayout()).catch((err) => message.error(errorMessage(err)));
        } else {
          writeLocalLayout(next);
        }
      }, 350);
    },
    [data, message]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Texts in the current language (translations, module names).
  const items = useMemo(
    () => (data?.items || []).map((item) => ({ ...item, ...itemText(item, { locale, t, settings, registry: MODULE_REGISTRY }) })),
    [data, locale, t, settings]
  );
  const { shown, hidden } = useMemo(() => arrange(items, layout), [items, layout]);
  const filtered = useMemo(() => {
    if (editing) return shown;
    const q = query.trim().toLowerCase();
    return shown.filter(
      (item) =>
        (!category || item.categoryId === category) &&
        (!q || `${item.title} ${item.description} ${item.host}`.toLowerCase().includes(q))
    );
  }, [shown, query, category, editing]);

  const current = () => ({ order: [...shown, ...hidden].map((item) => item.id), hidden: hidden.map((item) => item.id) });

  const onDragEnd = ({ active: dragged, over }) => {
    setActive(null);
    if (!over || dragged.id === over.id) return;
    const ids = shown.map((item) => item.id);
    const moved = arrayMove(ids, ids.indexOf(dragged.id), ids.indexOf(over.id));
    persist({ order: [...moved, ...hidden.map((item) => item.id)], hidden: hidden.map((item) => item.id) });
  };

  const hide = (item) => {
    const base = current();
    persist({ order: base.order, hidden: [...base.hidden, item.id] });
  };
  const show = (item) => {
    const base = current();
    const order = base.order.filter((id) => id !== item.id);
    order.splice(shown.length, 0, item.id);
    persist({ order, hidden: base.hidden.filter((id) => id !== item.id) });
  };

  const config = data?.config || {};
  const title = config.title || t('resources.title');
  const name = firstNameOf(user);
  const activeItem = items.find((item) => item.id === active);

  if (error) return <div className="rs-empty">{errorMessage(error)}</div>;

  return (
    <section className={`rs-board is-${variant} is-${config.density || 'comfortable'}${editing ? ' is-editing' : ''}`}>
      <header className="rs-head" data-tour="rs.head">
        <div className="rs-head__text">
          {variant === 'home' && (
            <span className="rs-head__eyebrow">{user ? greeting(t, name) : settings?.appName}</span>
          )}
          <h1>{title}</h1>
          {(config.subtitle || variant === 'home') && <p>{config.subtitle || t('resources.subtitle')}</p>}
        </div>
        <div className="rs-head__actions">
          {variant !== 'home' && <TourButton module="resources" />}
          {config.canManage && (
            <Link to="/app/resources/manage">
              <Button data-tour="rs.manage">{t('resources.manage')}</Button>
            </Link>
          )}
          {config.personalize && items.length > 0 && (
            editing ? (
              <>
                <Button type="text" onClick={() => persist(null)}>{t('resources.reset')}</Button>
                <Button type="primary" onClick={() => setEditing(false)}>{t('resources.done')}</Button>
              </>
            ) : (
              <Button data-tour="rs.customize" onClick={() => { setEditing(true); setQuery(''); setCategory(null); }}>
                <span aria-hidden="true">⚙</span> {t('resources.customize')}
              </Button>
            )
          )}
        </div>
      </header>

      {!editing && items.length > 0 && (config.showSearch || data?.categories.length > 0) && (
        <div className="rs-filters" data-tour="rs.filters">
          {config.showSearch && (
            <Input
              allowClear
              className="rs-search"
              prefix={<span className="rs-search__icon" aria-hidden="true">⌕</span>}
              placeholder={t('resources.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {data?.categories.length > 0 && (
            <div className="rs-chips" role="tablist" data-tour="rs.categories">
              <button type="button" className={!category ? 'is-active' : ''} onClick={() => setCategory(null)}>{t('resources.all')}</button>
              {data.categories.map((item) => (
                <button key={item.id} type="button" className={category === item.id ? 'is-active' : ''} style={{ '--c': item.color }} onClick={() => setCategory(category === item.id ? null : item.id)}>
                  <span className="rs-chips__dot" />
                  {categoryName(item, locale)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && <div className="rs-hint">{t('resources.editHint')}</div>}

      {!data ? (
        <div className="rs-grid">
          {[0, 1, 2, 3, 4, 5].map((key) => <div key={key} className="rs-tile is-loading"><Skeleton.Avatar active shape="square" size={52} /><Skeleton active paragraph={{ rows: 1 }} title={false} /></div>)}
        </div>
      ) : !items.length ? (
        <div className="rs-empty">
          <span className="rs-empty__art" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="15" height="15" rx="4" /><rect x="27" y="6" width="15" height="15" rx="4" /><rect x="6" y="27" width="15" height="15" rx="4" /><path d="M34.5 28v13M28 34.5h13" /></svg>
          </span>
          <strong>{config.canManage ? t('resources.emptyAdmin') : t('resources.empty')}</strong>
          {config.canManage && (
            <Link to="/app/resources/manage?new=1"><Button type="primary" icon={<PlusOutlined />}>{t('resources.add')}</Button></Link>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active: dragged }) => setActive(dragged.id)}
          onDragCancel={() => setActive(null)}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={filtered.map((item) => item.id)} strategy={rectSortingStrategy}>
            <div className="rs-grid" data-tour="rs.grid">
              {filtered.map((item) => (
                <Tile key={item.id} item={item} editing={editing} showDescription={config.showDescriptions} onHide={hide} onOpenInternal={(url) => navigate(url)} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
            {activeItem ? (
              <div className="rs-tile is-editing is-overlay">
                <span className="rs-tile__grip" aria-hidden="true">⋮⋮</span>
                <TileBody item={activeItem} showDescription={config.showDescriptions} editing />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {!editing && data && items.length > 0 && !filtered.length && <div className="rs-empty is-small">{t('resources.nothingFound')}</div>}

      {editing && (
        <div className="rs-hidden">
          <div className="rs-hidden__head">
            <strong>{t('resources.hiddenTitle', { n: hidden.length })}</strong>
            <span>{hidden.length ? t('resources.hiddenHint') : t('resources.hiddenEmpty')}</span>
          </div>
          {hidden.length > 0 && (
            <div className="rs-hidden__list">
              {hidden.map((item) => (
                <button key={item.id} type="button" className="rs-hidden__item" onClick={() => show(item)}>
                  <ResourceIcon icon={item.icon} title={item.title} size={30} />
                  <span>{item.title}</span>
                  <em>+ {t('resources.show')}</em>
                </button>
              ))}
            </div>
          )}
          {!data?.config.signedIn && <p className="rs-hidden__note">{t('resources.localNote')}</p>}
        </div>
      )}
    </section>
  );
}
