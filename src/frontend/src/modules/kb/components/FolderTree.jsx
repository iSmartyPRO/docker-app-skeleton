import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FolderIcon } from './Icons';
import { useLocale } from '../../../context/LocaleContext';

function Branch({ node, byParent, depth, config, openIds, toggle, onNavigate }) {
  const children = byParent.get(node.id) || [];
  const open = openIds.has(node.id);
  const { t } = useLocale();
  return (
    <li>
      <div className="kb-tree__row" style={{ paddingLeft: 6 + depth * 14 }}>
        <button
          type="button"
          className={`kb-tree__caret${children.length ? '' : ' is-empty'}${open ? ' is-open' : ''}`}
          onClick={() => toggle(node.id)}
          aria-label={t('common.a11y.toggleFolder')}
          aria-expanded={children.length ? open : undefined}
          tabIndex={children.length ? 0 : -1}
        >
          ▸
        </button>
        <NavLink to={`/app/kb/f/${node.id}`} className="kb-tree__link" onClick={onNavigate}>
          <FolderIcon folder={node} config={config} size={22} />
          <span>{node.name}</span>
        </NavLink>
      </div>
      {open && children.length > 0 && (
        <ul>
          {children.map((child) => (
            <Branch
              key={child.id}
              node={child}
              byParent={byParent}
              depth={depth + 1}
              config={config}
              openIds={openIds}
              toggle={toggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Sidebar folder tree; the branch leading to the current folder is open. */
export default function FolderTree({ folders, config, activePath = [], onNavigate }) {
  const byParent = useMemo(() => {
    const map = new Map();
    for (const folder of folders) {
      const key = folder.parentId || 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(folder);
    }
    return map;
  }, [folders]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const openIds = useMemo(() => {
    const open = new Set([...activePath, ...expanded]);
    collapsed.forEach((id) => open.delete(id));
    return open;
  }, [activePath, expanded, collapsed]);
  const toggle = (id) => {
    const isOpen = openIds.has(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(id);
      else next.add(id);
      return next;
    });
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <ul className="kb-tree">
      {(byParent.get(0) || []).map((node) => (
        <Branch
          key={node.id}
          node={node}
          byParent={byParent}
          depth={0}
          config={config}
          openIds={openIds}
          toggle={toggle}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}
