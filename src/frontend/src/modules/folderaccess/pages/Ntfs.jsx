import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Result, Select, Spin, Tree } from 'antd';
import { FolderOutlined, WarningOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { faApi, faError } from '../api';
import { useFolderAccess } from '../FolderAccessContext';
import { ReadOnlyBanner } from '../components/Bits';
import AclEditor from '../components/ntfs/AclEditor';

const childrenOf = (entries) => entries.map((entry) => ({ key: entry.path, title: entry.name, isLeaf: false, className: entry.hidden ? 'fa-ntfs-hidden' : undefined }));

function withChildren(nodes, key, children) {
  return nodes.map((node) => {
    if (node.key === key) return { ...node, children };
    if (node.children) return { ...node, children: withChildren(node.children, key, children) };
    return node;
  });
}

const ancestors = (path) => {
  const parts = String(path || '').split('/').filter(Boolean);
  return ['', ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))];
};

/**
 * NTFS permissions (superadministrators): the File server folders as a tree
 * (read with the administrator's own account) and the selected folder's
 * permissions with the draft editor.
 */
export default function Ntfs() {
  const { t } = useLocale();
  const { change } = useFolderAccess();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState(['']);
  const [treeError, setTreeError] = useState(null);
  // Tree requests belong to one share (and one opening of it): late answers for another are dropped.
  const treeToken = useRef(0);

  const shareId = Number(params.get('share')) || null;
  const path = params.get('path') || '';
  const fix = useMemo(() => {
    try {
      return params.get('fix') ? JSON.parse(params.get('fix')) : null;
    } catch {
      return null;
    }
  }, [params]);

  useEffect(() => {
    faApi
      .ntfs()
      .then(({ data }) => {
        setOverview(data);
        if (!params.get('share') && data.shares.length) {
          const first = data.shares.find((share) => share.letter) || data.shares[0];
          setParams({ share: String(first.id), path: '' }, { replace: true });
        }
      })
      .catch(setError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const share = overview?.shares.find((item) => item.id === shareId) || null;

  const loadChildren = useCallback(
    async (key) => {
      const token = treeToken.current;
      try {
        const data = await change(() => faApi.ntfsTree(shareId, key), { quiet: true, rethrow: true });
        if (!data || token !== treeToken.current) return;
        setTree((prev) => withChildren(prev, key, childrenOf(data.entries)));
        setTreeError(null);
      } catch (err) {
        if (token !== treeToken.current) return;
        setTreeError(err);
        setTree((prev) => withChildren(prev, key, []));
      }
    },
    [change, shareId]
  );

  // A new share: the root, opened down to the selected folder.
  useEffect(() => {
    if (!share) return;
    treeToken.current += 1;
    const token = treeToken.current;
    const root = { key: '', title: share.letter ? `${share.letter}: ${share.title}` : share.title, isLeaf: false, icon: <FolderOutlined /> };
    setTree([root]);
    setTreeError(null);
    const open = ancestors(path);
    setExpanded(open);
    (async () => {
      for (const key of open) {
        if (token !== treeToken.current) return;
        await loadChildren(key);
      }
    })();
  }, [share?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (key) => {
    const next = { share: String(shareId), path: key };
    setParams(next);
  };

  if (error) return <Result status="warning" title={faError(error, t)} />;
  if (!overview) return <div className="fa-loading"><Spin /></div>;

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        title={t('folderAccess.mode.ntfs')}
        description={t('folderAccess.ntfs.lead')}
        actions={[{ key: 'report', icon: <WarningOutlined />, label: t('folderAccess.ntfs.report.title'), onClick: () => navigate('/app/folderaccess/ntfs/report') }]}
      />
      <ReadOnlyBanner />
      {!overview.shares.length ? (
        <section className="panel">
          <Result status="info" title={t('folderAccess.ntfs.noShares')} />
        </section>
      ) : (
        <div className="fa-ntfs">
          <aside className="panel fa-ntfs-tree">
            <Select
              value={shareId}
              onChange={(id) => setParams({ share: String(id), path: '' })}
              options={overview.shares.map((item) => ({ value: item.id, label: `${item.letter ? `${item.letter}: ` : ''}${item.title} · \\\\${item.host}\\${item.share}` }))}
              style={{ width: '100%' }}
            />
            {treeError && <Alert type="warning" showIcon className="fa-notice" message={faError(treeError, t)} />}
            <Tree.DirectoryTree
              treeData={tree}
              expandedKeys={expanded}
              onExpand={(keys) => setExpanded(keys)}
              selectedKeys={[path]}
              onSelect={(keys) => keys.length && select(String(keys[0]))}
              loadData={(node) => (node.children ? Promise.resolve() : loadChildren(String(node.key)))}
              expandAction={false}
            />
          </aside>
          <div className="fa-ntfs-main">
            {shareId && <AclEditor key={`${shareId}:${path}`} shareId={shareId} path={path} fix={fix} onFixUsed={() => setParams({ share: String(shareId), path }, { replace: true })} />}
          </div>
        </div>
      )}
    </div>
  );
}
