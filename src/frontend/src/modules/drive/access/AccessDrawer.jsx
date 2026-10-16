import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Drawer, Empty, Grid, Result, Skeleton, Tabs, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined, SafetyOutlined, TeamOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { faApi, faError, folderUrl } from './api';
import { useAccess } from './AccessContext';
import { AdOff, LogonNotice, PairsNote, ReadOnlyBanner } from './components/Bits';
import { InheritedList, PairBlock } from './components/Pairs';
import { CreatePairDialog, DeleteGroupDialog, DescriptionDialog } from './components/GroupDialogs';
import AclEditor from './components/ntfs/AclEditor';
import './access.css';

/** The folder's access groups: every pair that opens it, the folders above that also do, creating a pair. */
function GroupsTab({ shareId, path }) {
  const { t } = useLocale();
  const { info } = useAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [describing, setDescribing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const superadmin = info?.role === 'superadmin';

  const load = useCallback(async () => {
    try {
      const { data: next } = await faApi.at(shareId, path);
      setData(next);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [shareId, path]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error) return <Result status="warning" title={faError(error, t)} extra={<Button icon={<ReloadOutlined />} onClick={load}>{t('folderAccess.refresh')}</Button>} />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const pairs = data.folders.flatMap((folder) => folder.pairs.map((pair) => ({ ...pair, folderKey: folder.key })));
  const project = data.folders.find((folder) => folder.project)?.project || data.create?.project || data.inherited.find((folder) => folder.project)?.project || null;
  const issues = [...new Set(data.folders.flatMap((folder) => (folder.needsReview ? folder.issues : [])))];

  return (
    <div className="fa-drawer__body">
      <div className="fa-drawer__paths">
        {data.paths.length ? (
          data.paths.map((item) => (
            <code key={item} className="fa-code">
              {item}
            </code>
          ))
        ) : (
          <span className="fa-muted">—</span>
        )}
        {project && <Tag bordered={false}>{t('folderAccess.project')}: {project}</Tag>}
        {data.folders.map((folder) => (
          <Link key={folder.key} to={folderUrl(folder.key)} className="fa-drawer__card">
            {t('folderAccess.panel.openCard')}
          </Link>
        ))}
      </div>
      <ReadOnlyBanner />
      <LogonNotice />
      {!data.mapped && (
        <Alert
          className="fa-notice"
          type="info"
          showIcon
          message={t('folderAccess.panel.noPrefix', { share: data.share.title })}
          description={superadmin ? <Link to="/admin/settings/drive">{t('folderAccess.panel.noPrefixAction')}</Link> : t('folderAccess.panel.noPrefixAsk')}
        />
      )}
      {issues.length > 0 && <Alert className="fa-notice" type="warning" showIcon message={t('folderAccess.needsReview')} description={issues.map((issue) => t(`folderAccess.issues.${issue}`)).join(' · ')} />}
      {pairs.length > 1 && <PairsNote n={pairs.length} />}
      {pairs.map((pair) => (
        <PairBlock key={pair.key} pair={pair} members={data.members} onChanged={load} onDescribe={setDescribing} onDelete={setDeleting} compact />
      ))}
      {data.mapped && !pairs.length && (
        <section className="panel fa-drawer__empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <>
                <strong>{t('folderAccess.panel.noGroups')}</strong>
                <br />
                <span className="fa-muted">{data.inherited.length ? t('folderAccess.panel.noGroupsInherited') : t('folderAccess.panel.noGroupsText')}</span>
              </>
            }
          >
            {superadmin && info?.canWrite && (
              <Button type="primary" icon={<PlusOutlined />} disabled={!data.create?.available} onClick={() => setCreating(true)}>
                {t('folderAccess.panel.createPair')}
              </Button>
            )}
            {superadmin && data.create && !data.create.available && <div className="fa-muted fa-drawer__hint">{t('folderAccess.create.noOuHint')}</div>}
          </Empty>
        </section>
      )}
      {superadmin && info?.canWrite && pairs.length > 0 && data.create?.available && (
        <div className="fa-drawer__more">
          <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t('folderAccess.panel.createAnother')}
          </Button>
        </div>
      )}
      <InheritedList folders={data.inherited} />
      {creating && (
        <CreatePairDialog
          open
          plan={data.create}
          onClose={(done) => {
            setCreating(false);
            if (done) load();
          }}
        />
      )}
      <DescriptionDialog group={describing} onClose={(done) => { setDescribing(null); if (done) load(); }} />
      <DeleteGroupDialog group={deleting} onClose={(done) => { setDeleting(null); if (done) load(); }} />
    </div>
  );
}

/**
 * The «Доступ» panel of a File server folder (opened from the folder's toolbar or menu):
 * «Группы доступа» for superadministrators and system administrators (drive.access),
 * «Права NTFS» (the ACL editor) for superadministrators only.
 */
export default function AccessDrawer({ open, shareId, path, title, tab = 'groups', fix = null, onTab, onFixUsed, onClose }) {
  const { t } = useLocale();
  const { info, error } = useAccess();
  const screens = Grid.useBreakpoint();
  const superadmin = info?.role === 'superadmin';
  const current = superadmin && tab === 'ntfs' ? 'ntfs' : 'groups';
  const items = useMemo(
    () => [
      { key: 'groups', label: <span><TeamOutlined /> {t('folderAccess.mode.groups')}</span>, children: open && current === 'groups' ? <GroupsTab shareId={shareId} path={path} /> : null },
      superadmin && {
        key: 'ntfs',
        label: <span><SafetyOutlined /> {t('folderAccess.mode.ntfs')}</span>,
        children: open && current === 'ntfs' ? <AclEditor key={`${shareId}:${path}`} shareId={shareId} path={path} fix={fix} onFixUsed={onFixUsed} /> : null,
      },
    ].filter(Boolean),
    [t, open, current, shareId, path, superadmin, fix, onFixUsed]
  );
  let body;
  if (error) body = <Result status="warning" title={faError(error, t)} />;
  else if (!info) body = <Skeleton active paragraph={{ rows: 6 }} />;
  else if (!info.role) body = <Result status="403" title={t('folderAccess.noAccess')} subTitle={t('folderAccess.noAccessText')} />;
  else if (!info.adConfigured) body = <AdOff role={info.role} />;
  else body = <Tabs className="fa-drawer__tabs" activeKey={current} onChange={onTab} items={items} />;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={screens.lg ? 980 : '100%'}
      className="fa-drawer"
      title={
        <div className="fa-drawer__title">
          <span className="fa-drawer__icon"><SafetyOutlined /></span>
          <div>
            <div className="fa-drawer__heading">{t('folderAccess.panel.title')}</div>
            <div className="fa-muted fa-drawer__folder">{title}</div>
          </div>
        </div>
      }
      destroyOnHidden
    >
      {body}
    </Drawer>
  );
}
