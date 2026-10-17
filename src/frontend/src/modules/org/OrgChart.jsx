import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Empty, Tooltip } from 'antd';
import Segmented from '../../components/ui/Segmented';
import { CompressOutlined, MinusOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useLocale } from '../../context/LocaleContext';
import { MenuIcon } from '../../components/icons/menuIcons';
import { initialsOf, typeLabel, typeOf } from './lib';
import './org.css';

/**
 * The org chart (spec §3, §4.2 «Оргсхема»): units top-down with their heads
 * and headcount. Wide trees scroll and zoom; on phones (or with «Список») it
 * becomes an indented list. Used by Settings → Org structure and the
 * Employees module.
 *
 *   <OrgChart tree={tree} meta={meta} onSelect={(unit) => …} selectedId={id} />
 *
 * `tree`: nested units ({ …unit, children, total, head, counts }) from GET /api/app/org/chart.
 */
export default function OrgChart({ tree = [], meta, onSelect, selectedId, countLabel, emptyText }) {
  const { t } = useLocale();
  const narrow = useNarrow();
  const [mode, setMode] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const view = mode || (narrow ? 'list' : 'chart');
  const scroller = useRef(null);

  // Start with the first two levels open; deeper branches collapsed when the tree is big.
  const total = useMemo(() => countNodes(tree), [tree]);
  useEffect(() => {
    if (total <= 24) return;
    const next = new Set();
    const walk = (nodes, depth) => nodes.forEach((node) => {
      if (depth >= 2 && node.children.length) next.add(node.id);
      walk(node.children, depth + 1);
    });
    walk(tree, 0);
    setCollapsed(next);
  }, [tree, total]);

  // A chart wider than the box starts fitted (not below 55 %) and centred.
  useEffect(() => {
    if (view !== 'chart') return undefined;
    const frame = requestAnimationFrame(() => {
      const box = scroller.current;
      const inner = box?.firstElementChild;
      if (!box || !inner) return;
      const natural = inner.scrollWidth / zoom;
      if (natural > box.clientWidth) {
        const next = Math.max(0.55, Math.min(1, +((box.clientWidth - 24) / natural).toFixed(2)));
        if (next !== zoom) setZoom(next);
      }
      requestAnimationFrame(() => {
        box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [tree, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!tree.length) return <Empty description={emptyText || t('org.chart.empty')} />;

  return (
    <div className="org-chart" data-tour="org.chart">
      <div className="org-chart__bar">
        <Segmented
          size="small"
          value={view}
          onChange={setMode}
          options={[
            { value: 'chart', label: t('org.chart.modeChart') },
            { value: 'list', label: t('org.chart.modeList') },
          ]}
        />
        {view === 'chart' && (
          <div className="org-chart__zoom">
            <Tooltip title={t('org.chart.zoomOut')}>
              <Button size="small" icon={<MinusOutlined />} aria-label={t('org.chart.zoomOut')} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} />
            </Tooltip>
            <span className="org-chart__pct">{Math.round(zoom * 100)}%</span>
            <Tooltip title={t('org.chart.zoomIn')}>
              <Button size="small" icon={<PlusOutlined />} aria-label={t('org.chart.zoomIn')} onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))} />
            </Tooltip>
            <Tooltip title={t('org.chart.fit')}>
              <Button
                size="small"
                icon={<CompressOutlined />}
                aria-label={t('org.chart.fit')}
                onClick={() => {
                  const box = scroller.current;
                  const inner = box?.firstElementChild;
                  if (!box || !inner) return;
                  const ratio = (box.clientWidth - 24) / (inner.scrollWidth / zoom);
                  setZoom(Math.max(0.5, Math.min(1, +ratio.toFixed(2))));
                }}
              />
            </Tooltip>
            <Button size="small" type="text" onClick={() => setCollapsed(new Set())}>
              {t('org.chart.expandAll')}
            </Button>
          </div>
        )}
      </div>
      {view === 'chart' ? (
        <div className="org-chart__scroll" ref={scroller}>
          <div className="org-chart__canvas" style={{ zoom }}>
            <ul className="org-tree">
              {tree.map((node) => (
                <ChartNode key={node.id} node={node} meta={meta} collapsed={collapsed} toggle={toggle} onSelect={onSelect} selectedId={selectedId} countLabel={countLabel} />
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="org-list" role="tree">
          {tree.map((node) => (
            <ListNode key={node.id} node={node} meta={meta} depth={0} collapsed={collapsed} toggle={toggle} onSelect={onSelect} selectedId={selectedId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function countNodes(nodes) {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children || []), 0);
}

function useNarrow() {
  const query = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const list = window.matchMedia(query);
    const on = () => setNarrow(list.matches);
    list.addEventListener?.('change', on);
    return () => list.removeEventListener?.('change', on);
  }, []);
  return narrow;
}

function HeadLine({ head, t }) {
  if (!head) return <span className="org-node__nohead">{t('org.chart.noHead')}</span>;
  return (
    <span className="org-node__head">
      <Avatar size={28} src={head.avatarUrl || undefined}>
        {initialsOf(head.name)}
      </Avatar>
      <span className="org-node__headtext">
        <strong>{head.name}</strong>
        {head.position && <em>{head.position}</em>}
      </span>
    </span>
  );
}

function ChartNode({ node, meta, collapsed, toggle, onSelect, selectedId, countLabel }) {
  const { t } = useLocale();
  const type = typeOf(meta, node.type);
  const own = node.counts?.employees ?? node.counts?.users ?? 0;
  const isCollapsed = collapsed.has(node.id);
  return (
    <li>
      <div className={`org-node${node.status === 'closed' ? ' is-closed' : ''}${selectedId === node.id ? ' is-selected' : ''}`} style={{ '--c': type.color }}>
        <button type="button" className="org-node__body" onClick={() => onSelect?.(node)} aria-label={`${node.name}, ${typeLabel(type, t)}`}>
          <span className="org-node__type">
            <MenuIcon name={type.icon} variant="mono" />
            {typeLabel(type, t)}
            {node.code && <span className="org-node__code">{node.code}</span>}
          </span>
          <span className="org-node__name">{node.name}</span>
          <HeadLine head={node.head} t={t} />
          <span className="org-node__count">
            <TeamOutlined /> {countLabel ? countLabel(node) : t('org.chart.people', { own, total: node.total ?? own })}
          </span>
        </button>
        {node.children.length > 0 && (
          <button type="button" className="org-node__toggle" onClick={() => toggle(node.id)} aria-expanded={!isCollapsed} aria-label={isCollapsed ? t('org.chart.expand') : t('org.chart.collapse')}>
            {isCollapsed ? `+${node.children.length}` : '−'}
          </button>
        )}
      </div>
      {node.children.length > 0 && !isCollapsed && (
        <ul>
          {node.children.map((child) => (
            <ChartNode key={child.id} node={child} meta={meta} collapsed={collapsed} toggle={toggle} onSelect={onSelect} selectedId={selectedId} countLabel={countLabel} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ListNode({ node, meta, depth, collapsed, toggle, onSelect, selectedId }) {
  const { t } = useLocale();
  const type = typeOf(meta, node.type);
  const isCollapsed = collapsed.has(node.id);
  const own = node.counts?.employees ?? node.counts?.users ?? 0;
  return (
    <li role="treeitem" aria-expanded={node.children.length ? !isCollapsed : undefined}>
      <div className={`org-row${selectedId === node.id ? ' is-selected' : ''}${node.status === 'closed' ? ' is-closed' : ''}`} style={{ '--c': type.color, '--d': depth }}>
        {node.children.length > 0 ? (
          <button type="button" className="org-row__toggle" onClick={() => toggle(node.id)} aria-label={isCollapsed ? t('org.chart.expand') : t('org.chart.collapse')}>
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="org-row__toggle" />
        )}
        <button type="button" className="org-row__body" onClick={() => onSelect?.(node)}>
          <span className="org-row__icon">
            <MenuIcon name={type.icon} variant="mono" />
          </span>
          <span className="org-row__text">
            <strong>{node.name}</strong>
            <em>{node.head ? node.head.name : t('org.chart.noHead')}</em>
          </span>
          <span className="org-row__count">
            <TeamOutlined /> {node.total ?? own}
          </span>
        </button>
      </div>
      {node.children.length > 0 && !isCollapsed && (
        <ul role="group">
          {node.children.map((child) => (
            <ListNode key={child.id} node={child} meta={meta} depth={depth + 1} collapsed={collapsed} toggle={toggle} onSelect={onSelect} selectedId={selectedId} />
          ))}
        </ul>
      )}
    </li>
  );
}
