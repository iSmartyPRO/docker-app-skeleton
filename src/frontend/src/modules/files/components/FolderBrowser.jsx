import { useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox, Empty, Input, Spin } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { formatBytes, filesApi } from '../api';
import { NodeIcon, nodeLabel } from './NodeList';
import '../../shared/module.css';
import '../files.css';

/**
 * Compact browser over My files, Shared with me and shared spaces.
 *  - mode "folder": pick a destination (onPlace receives the current place)
 *  - mode "files":  tick files (onSelection receives the chosen nodes)
 * `exclude` hides a node (and so its subtree) — e.g. the folder being moved.
 */
export default function FolderBrowser({ mode = 'files', multiple = true, accept, exclude, onPlace, onSelection, initial }) {
  const { t } = useLocale();
  const [spaces, setSpaces] = useState([]);
  const [place, setPlace] = useState(initial || { type: 'my' });
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Map());
  const [q, setQ] = useState('');

  useEffect(() => {
    filesApi.home().then((res) => setSpaces(res.data.spaces)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setData(null);
    let res;
    if (q.trim().length >= 2) res = await filesApi.search(q.trim());
    else if (place.folderId) res = await filesApi.folder(place.folderId);
    else if (place.type === 'shared') res = await filesApi.shared();
    else if (place.type === 'space') res = await filesApi.space(place.spaceId);
    else res = await filesApi.my();
    setData(res.data);
  }, [place, q]);

  useEffect(() => {
    const timer = setTimeout(() => load().catch(() => setData({ items: [] })), q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    onPlace?.(place, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, data]);

  const items = useMemo(
    () =>
      (data?.items || []).filter((node) => {
        if (exclude && node.id === exclude) return false;
        if (mode === 'folder') return node.kind === 'folder';
        return node.kind === 'folder' || !accept || accept(node);
      }),
    [data, mode, accept, exclude]
  );

  const toggle = (node) => {
    setSelected((prev) => {
      const next = multiple ? new Map(prev) : new Map();
      if (prev.has(node.id)) next.delete(node.id);
      else next.set(node.id, node);
      onSelection?.([...next.values()]);
      return next;
    });
  };

  const openFolder = (node) => {
    setQ('');
    setPlace({ type: place.type, spaceId: place.spaceId, folderId: node.id, name: node.name });
  };

  const crumbs = data?.crumbs || [];
  const rootLabel = place.type === 'shared' ? t('files.sharedWithMe') : place.type === 'space' ? spaces.find((space) => space.id === place.spaceId)?.name : t('files.myFiles');

  return (
    <div className="fs-browser">
      <aside className="fs-browser__places">
        <button type="button" className={place.type === 'my' && !q ? 'is-active' : ''} onClick={() => { setQ(''); setPlace({ type: 'my' }); }}>
          {t('files.myFiles')}
        </button>
        <button type="button" className={place.type === 'shared' && !q ? 'is-active' : ''} onClick={() => { setQ(''); setPlace({ type: 'shared' }); }}>
          {t('files.sharedWithMe')}
        </button>
        {spaces.length > 0 && <span className="fs-browser__label">{t('files.spaces')}</span>}
        {spaces.map((space) => (
          <button
            key={space.id}
            type="button"
            className={place.type === 'space' && place.spaceId === space.id && !q ? 'is-active' : ''}
            onClick={() => { setQ(''); setPlace({ type: 'space', spaceId: space.id }); }}
          >
            <span className="mod-dot" style={{ '--c': space.color }} />
            {space.name}
          </button>
        ))}
      </aside>
      <section className="fs-browser__main">
        <Input.Search allowClear placeholder={t('files.search')} value={q} onChange={(event) => setQ(event.target.value)} />
        <nav className="fs-browser__crumbs">
          <button type="button" onClick={() => setPlace({ type: place.type, spaceId: place.spaceId })}>{rootLabel}</button>
          {place.folderId &&
            [...crumbs, { id: place.folderId, name: data?.folder?.name || place.name }].map((crumb) => (
              <span key={crumb.id}>
                <span className="fs-browser__sep">/</span>
                <button type="button" onClick={() => setPlace({ type: place.type, spaceId: place.spaceId, folderId: crumb.id, name: crumb.name })}>{nodeLabel(crumb, t)}</button>
              </span>
            ))}
        </nav>
        <div className="fs-browser__list">
          {!data ? (
            <div className="fs-browser__loading"><Spin /></div>
          ) : !items.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={mode === 'folder' ? t('files.noSubfolders') : t('files.empty')} />
          ) : (
            items.map((node) => (
              <div
                key={node.id}
                className={`fs-browser__row${selected.has(node.id) ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => (node.kind === 'folder' ? openFolder(node) : toggle(node))}
                onKeyDown={(event) => event.key === 'Enter' && (node.kind === 'folder' ? openFolder(node) : toggle(node))}
              >
                {mode === 'files' && node.kind === 'file' && <Checkbox checked={selected.has(node.id)} />}
                <NodeIcon node={node} size={26} />
                <span className="fs-browser__name">{nodeLabel(node, t)}</span>
                <span className="fs-browser__meta">{node.kind === 'file' ? formatBytes(node.file?.size) : '›'}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
