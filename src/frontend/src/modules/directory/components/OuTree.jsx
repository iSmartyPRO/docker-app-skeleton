import { useCallback, useEffect, useState } from 'react';
import { Skeleton, Tooltip, Tree } from 'antd';
import { ApartmentOutlined, ClusterOutlined, FolderOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { adApi, adError } from '../api';

const toNode = (item, t) => ({
  key: item.dn,
  dn: item.dn,
  name: item.name,
  description: item.description,
  counts: item.counts,
  total: item.total,
  truncated: item.truncated,
  isLeaf: !item.hasChildren,
  kind: item.kind,
  title: <NodeTitle item={item} t={t} />,
  icon: item.kind === 'container' ? <FolderOutlined /> : <ClusterOutlined />,
});

function NodeTitle({ item, t }) {
  const counts = item.counts || {};
  const hint = [counts.user ? t('directory.counts.users', { n: counts.user }) : null, counts.group ? t('directory.counts.groups', { n: counts.group }) : null, counts.computer ? t('directory.counts.computers', { n: counts.computer }) : null].filter(Boolean).join(' · ');
  return (
    <span className="ad-node">
      <span className="ad-node__name" title={item.description || item.name}>
        {item.name}
      </span>
      {item.total > 0 && (
        <Tooltip title={item.truncated ? `${hint} · ${t('directory.counts.truncated')}` : hint} placement="right">
          {/* Past the counting limit the server stops reading: «2000+». */}
          <span className="ad-node__count">{item.truncated ? `${item.total}+` : item.total}</span>
        </Tooltip>
      )}
    </span>
  );
}

const replaceChildren = (list, key, children) =>
  list.map((node) => (node.key === key ? { ...node, children } : node.children ? { ...node, children: replaceChildren(node.children, key, children) } : node));

/**
 * The OU tree inside the managed root: lazy (one level per expand), with the number of
 * objects in each subtree. Excluded OUs never come from the server.
 * `selected` (DN), `onSelect(dn, node)`; `reloadKey` reloads from the root.
 */
export default function OuTree({ selected, onSelect, reloadKey = 0, height, className = '' }) {
  const { t } = useLocale();
  const [nodes, setNodes] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState([]);

  const loadRoot = useCallback(async () => {
    try {
      setError(null);
      const { data } = await adApi.tree();
      const root = { ...toNode({ ...data.node, counts: data.node.self, total: data.node.total, hasChildren: data.children.length > 0, kind: 'ou' }, t), icon: <ApartmentOutlined />, children: data.children.map((child) => toNode(child, t)), isLeaf: false };
      setNodes([root]);
      setExpanded((prev) => (prev.length ? prev : [root.key]));
    } catch (err) {
      setError(adError(err, t));
    }
  }, [t]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot, reloadKey]);

  const loadData = async (node) => {
    if (node.children) return;
    try {
      const { data } = await adApi.tree(node.key);
      setNodes((prev) => replaceChildren(prev, node.key, data.children.map((child) => toNode(child, t))));
    } catch (err) {
      setError(adError(err, t));
    }
  };

  if (error) return <div className="ad-tree__error">{error}</div>;
  if (!nodes) return <Skeleton active paragraph={{ rows: 6 }} title={false} />;
  return (
    <Tree
      className={`ad-tree ${className}`}
      showIcon
      blockNode
      treeData={nodes}
      loadData={loadData}
      expandedKeys={expanded}
      onExpand={setExpanded}
      selectedKeys={selected ? [selected] : []}
      onSelect={(keys, { node }) => keys.length && onSelect?.(node.key, node)}
      height={height}
    />
  );
}
