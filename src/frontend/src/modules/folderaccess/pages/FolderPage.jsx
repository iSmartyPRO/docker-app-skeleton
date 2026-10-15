import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Dropdown, Empty, Popconfirm, Result, Spin, Table, Tooltip } from 'antd';
import { ArrowRightOutlined, DeleteOutlined, EditOutlined, LockOutlined, MoreOutlined, ReloadOutlined, UserAddOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import ModuleHeader from '../../shared/ModuleHeader';
import { faApi, faError, personUrl } from '../api';
import { useFolderAccess } from '../FolderAccessContext';
import { LogonNotice, ReadOnlyBanner, ReviewTag, StatusTag, TypeTag } from '../components/Bits';
import PersonSelect from '../components/PersonSelect';
import { DeleteGroupDialog, DescriptionDialog } from '../components/GroupDialogs';

const OTHER = { full: 'read', read: 'full' };

/** One group of the folder: its members, add / remove / move to the other group. */
function GroupColumn({ slot, group, members, otherGroup, onChanged, onDescribe, onDelete }) {
  const { t } = useLocale();
  const { info, change } = useFolderAccess();
  const [selected, setSelected] = useState([]);
  const [adding, setAdding] = useState([]);
  const [busy, setBusy] = useState(false);
  const editable = Boolean(group.editable && info?.canWrite);
  const canMove = editable && otherGroup?.editable;
  const superadmin = info?.role === 'superadmin' && info?.canWrite;

  const run = async (fn) => {
    setBusy(true);
    const data = await change(fn);
    setBusy(false);
    if (data) {
      setSelected([]);
      setAdding([]);
      onChanged();
    }
  };
  const add = () => run(() => faApi.members(group.dn, adding, 'add'));
  const remove = (dns) => run(() => faApi.members(group.dn, dns, 'remove'));
  const move = (dns) => run(() => faApi.move(group.dn, otherGroup.dn, dns));

  return (
    <section className="panel fa-col">
      <header className="fa-col__head">
        <div>
          <div className="fa-col__title">
            {slot === 'other' ? null : <TypeTag type={slot} />}
            <code>{group.name}</code>
            {!group.editable && (
              <Tooltip title={t('folderAccess.protected')}>
                <LockOutlined className="fa-lock" />
              </Tooltip>
            )}
            <ReviewTag issues={group.issues} />
          </div>
          <div className="fa-muted">{group.description || t('folderAccess.noDescription')}</div>
        </div>
        <span className="fa-col__count">{members.length}</span>
        {superadmin && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'describe', icon: <EditOutlined />, label: t('folderAccess.describe.action'), onClick: () => onDescribe(group) },
                { key: 'delete', icon: <DeleteOutlined />, danger: true, label: t('folderAccess.delete.action'), onClick: () => onDelete({ ...group, memberCount: members.length }) },
              ],
            }}
          >
            <Button type="text" icon={<MoreOutlined />} aria-label={t('folderAccess.more')} />
          </Dropdown>
        )}
      </header>
      {editable && (
        <div className="fa-add">
          <PersonSelect mode="multiple" value={adding} onChange={setAdding} kind={info?.role === 'superadmin' ? 'all' : 'user'} exclude={members.map((member) => member.dn)} style={{ flex: 1 }} />
          <Button type="primary" icon={<UserAddOutlined />} disabled={!adding.length} loading={busy} onClick={add}>
            {t('folderAccess.add')}
          </Button>
        </div>
      )}
      {editable && selected.length > 0 && (
        <div className="fa-selection">
          <span>{t('folderAccess.selected', { n: selected.length })}</span>
          {canMove && (
            <Button size="small" icon={<ArrowRightOutlined />} onClick={() => move(selected)} loading={busy}>
              {t('folderAccess.moveTo', { type: t(`folderAccess.type.${OTHER[slot]}`) })}
            </Button>
          )}
          <Popconfirm title={t('folderAccess.removeConfirm', { n: selected.length })} onConfirm={() => remove(selected)}>
            <Button size="small" danger icon={<DeleteOutlined />} loading={busy}>
              {t('folderAccess.remove')}
            </Button>
          </Popconfirm>
        </div>
      )}
      <Table
        size="small"
        rowKey="dn"
        dataSource={members}
        pagination={{ pageSize: 100, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('folderAccess.noMembers')} /> }}
        rowSelection={editable ? { selectedRowKeys: selected, onChange: setSelected } : undefined}
        columns={[
          {
            title: t('folderAccess.person'),
            render: (_, person) => (
              <div className="fa-person-cell">
                <Link to={personUrl(person.dn)}>{person.name}</Link>
                <span className="fa-muted">{[person.login, person.kind !== 'user' && person.kind !== 'unknown' ? t(`folderAccess.kind.${person.kind}`) : null].filter(Boolean).join(' · ')}</span>
              </div>
            ),
          },
          { title: t('folderAccess.department'), dataIndex: 'department', responsive: ['lg'], render: (value) => value || <span className="fa-muted">—</span> },
          { title: t('folderAccess.status'), width: 110, render: (_, person) => <StatusTag person={person} /> },
          editable && {
            title: '',
            width: 84,
            render: (_, person) => (
              <span className="fa-row-actions">
                {canMove && (
                  <Tooltip title={t('folderAccess.moveTo', { type: t(`folderAccess.type.${OTHER[slot]}`) })}>
                    <Button size="small" type="text" icon={<ArrowRightOutlined />} onClick={() => move([person.dn])} />
                  </Tooltip>
                )}
                <Popconfirm title={t('folderAccess.removeOne', { name: person.name })} onConfirm={() => remove([person.dn])}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('folderAccess.remove')} />
                </Popconfirm>
              </span>
            ),
          },
        ].filter(Boolean)}
      />
    </section>
  );
}

/** A folder: path, File server folder, review reasons and both groups side by side. */
export default function FolderPage() {
  const { t } = useLocale();
  const { key } = useParams();
  const navigate = useNavigate();
  const { info } = useFolderAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [describing, setDescribing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: next } = await faApi.folder(key);
      setData(next);
      setError(null);
    } catch (err) {
      setError(faError(err, t));
    }
  }, [key, t]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error) return <Result status="warning" title={error} extra={<Button onClick={() => navigate('/app/folderaccess')}>{t('folderAccess.backToFolders')}</Button>} />;
  if (!data) return <div className="fa-loading"><Spin /></div>;
  const { folder, members } = data;
  const share = (info?.config?.driveMap || []).find((row) => row.shareId === folder.shareId);
  const slots = folder.kind === 'other' ? ['other'] : ['full', 'read', 'unknown'].filter((slot) => folder.groups[slot]);

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        crumbs={[{ key: 'root', label: t('folderAccess.folders.title'), to: '/app/folderaccess' }, { key: 'cur', label: folder.path || folder.name }]}
        title={folder.path || folder.name}
        description={share ? t('folderAccess.onShare', { share: share.title || `#${share.shareId}`, path: folder.relPath || '/' }) : null}
        actions={[{ key: 'refresh', icon: <ReloadOutlined />, label: t('folderAccess.refresh'), onClick: load }]}
      />
      <ReadOnlyBanner />
      <LogonNotice />
      {folder.needsReview && (
        <Alert className="fa-notice" type="warning" showIcon message={t('folderAccess.needsReview')} description={folder.issues.map((issue) => t(`folderAccess.issues.${issue}`)).join(' · ')} />
      )}
      {(folder.root || folder.protected) && info?.role !== 'superadmin' && <Alert className="fa-notice" type="info" showIcon message={t('folderAccess.protectedText')} />}
      <div className={`fa-cols${slots.length === 1 ? ' is-single' : ''}`}>
        {slots.map((slot) => (
          <GroupColumn
            key={slot}
            slot={slot}
            group={folder.groups[slot]}
            members={members[slot] || []}
            otherGroup={OTHER[slot] ? folder.groups[OTHER[slot]] : null}
            onChanged={load}
            onDescribe={setDescribing}
            onDelete={setDeleting}
          />
        ))}
      </div>
      <DescriptionDialog group={describing} onClose={(done) => { setDescribing(null); if (done) load(); }} />
      <DeleteGroupDialog group={deleting} onClose={(done) => { setDeleting(null); if (done) load().catch(() => {}); }} />
    </div>
  );
}
