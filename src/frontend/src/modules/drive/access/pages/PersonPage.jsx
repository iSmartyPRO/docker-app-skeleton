import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App, Button, Empty, Modal, Popconfirm, Result, Segmented, Select, Spin, Table, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined, LockOutlined, PlusOutlined, StopOutlined, SwapOutlined } from '@ant-design/icons';
import { useLocale } from '../../../../context/LocaleContext';
import ModuleHeader from '../../../shared/ModuleHeader';
import { ACCESS_ROOT, faApi, faError, folderUrl } from '../api';
import { useAccess } from '../AccessContext';
import { LogonNotice, ReadOnlyBanner, StatusTag, TypeTag } from '../components/Bits';
import PersonSelect from '../components/PersonSelect';

/** Copy access from another person: every folder group they have, added to this person. */
function CopyDialog({ open, person, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { change } = useAccess();
  const [from, setFrom] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setFrom(null);
  }, [open]);
  const submit = async () => {
    setBusy(true);
    const data = await change(() => faApi.copy(from, person.dn));
    setBusy(false);
    if (data) {
      if (data.skipped?.length) message.info(t('folderAccess.result.skipped', { groups: data.skipped.map((item) => item.group).join(', ') }));
      onClose(true);
    }
  };
  return (
    <Modal open={open} onCancel={() => onClose(false)} onOk={submit} okButtonProps={{ disabled: !from, loading: busy }} okText={t('folderAccess.copy.submit')} title={t('folderAccess.copy.title', { name: person?.name })} destroyOnHidden>
      <p className="fa-muted">{t('folderAccess.copy.lead')}</p>
      <PersonSelect value={from} onChange={setFrom} exclude={person ? [person.dn] : []} style={{ width: '100%' }} autoFocus />
    </Modal>
  );
}

/** Add the person to a folder with a chosen access type. */
function AddToFolder({ person, onChanged }) {
  const { t } = useLocale();
  const { change } = useAccess();
  const [folders, setFolders] = useState(null);
  const [key, setKey] = useState(null);
  const [type, setType] = useState('read');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    faApi
      .folders()
      // One choice per group pair (a folder opened by two pairs lists both, named).
      .then(({ data }) =>
        setFolders(
          data.folders
            .filter((folder) => folder.kind === 'sg')
            .flatMap((folder) => folder.pairs.filter((pair) => pair.editable).map((pair) => ({ key: `${folder.key}|${pair.key}`, label: `${folder.path || folder.name}${folder.pairs.length > 1 ? ` · ${pair.name}` : ''}${folder.project ? ` — ${folder.project}` : ''}`, pair })))
        )
      )
      .catch(() => setFolders([]));
  }, []);
  const choice = (folders || []).find((item) => item.key === key);
  const group = choice?.pair?.groups?.[type];
  const add = async () => {
    setBusy(true);
    const data = await change(() => faApi.members(group.dn, [person.dn], 'add'));
    setBusy(false);
    if (data) {
      setKey(null);
      onChanged();
    }
  };
  return (
    <div className="fa-add">
      <Select
        showSearch
        loading={!folders}
        value={key}
        onChange={setKey}
        placeholder={t('folderAccess.person.chooseFolder')}
        optionFilterProp="label"
        options={(folders || []).map((item) => ({ value: item.key, label: item.label }))}
        style={{ flex: 1, minWidth: 220 }}
      />
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'read', label: t('folderAccess.type.read') },
          { value: 'full', label: t('folderAccess.type.full') },
        ]}
      />
      <Button type="primary" icon={<PlusOutlined />} disabled={!group?.editable} loading={busy} onClick={add}>
        {t('folderAccess.add')}
      </Button>
    </div>
  );
}

/** A person: details and every folder group they are in, with changes. */
export default function PersonPage() {
  const { t } = useLocale();
  const [params] = useSearchParams();
  const dn = params.get('dn') || '';
  const { info, change } = useAccess();
  const { modal } = App.useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copying, setCopying] = useState(false);
  const [folders, setFolders] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data: next } = await faApi.person(dn);
      setData(next);
      setError(null);
    } catch (err) {
      setError(faError(err, t));
    }
  }, [dn, t]);
  useEffect(() => {
    setData(null);
    if (dn) load();
  }, [dn, load]);
  useEffect(() => {
    faApi
      .folders()
      .then(({ data: next }) => setFolders(next.folders))
      .catch(() => setFolders([]));
  }, []);

  // Group DN → its pair (to move a person to the other group of the same pair).
  const pairOf = useMemo(() => Object.fromEntries(folders.flatMap((folder) => folder.pairs.flatMap((pair) => Object.values(pair.groups).map((group) => [group.dn, pair])))), [folders]);

  if (!dn) return <Result status="info" title={t('folderAccess.people.typeToSearch')} />;
  if (error) return <Result status="warning" title={error} />;
  if (!data) return <div className="fa-loading"><Spin /></div>;
  const { person, access } = data;
  const canWrite = info?.canWrite;
  const editableCount = access.filter((row) => row.group.editable).length;

  const run = async (fn) => {
    const result = await change(fn);
    if (result) load();
  };
  const revokeAll = () =>
    modal.confirm({
      title: t('folderAccess.revoke.title', { name: person.name }),
      content: t('folderAccess.revoke.text', { n: editableCount }),
      okText: t('folderAccess.revoke.submit'),
      okButtonProps: { danger: true },
      onOk: () => run(() => faApi.revokeAll(person.dn)),
    });

  return (
    <div className="fs-page fa-page">
      <ModuleHeader
        crumbs={[{ key: 'people', label: t('folderAccess.people.title'), to: `${ACCESS_ROOT}/people` }, { key: 'cur', label: person.name }]}
        title={person.name}
        meta={
          <span className="fa-tags">
            {person.login && <code>{person.login}</code>}
            <StatusTag person={person} />
          </span>
        }
        description={[person.department, person.title].filter(Boolean).join(' · ') || null}
        actions={[
          canWrite && person.kind === 'user' && { key: 'copy', icon: <CopyOutlined />, label: t('folderAccess.copy.action'), onClick: () => setCopying(true) },
          canWrite && editableCount > 0 && { key: 'revoke', danger: true, icon: <StopOutlined />, label: t('folderAccess.revoke.action'), onClick: revokeAll },
        ]}
      />
      <ReadOnlyBanner />
      <LogonNotice />
      {canWrite && (person.kind === 'user' || info?.role === 'superadmin') && (
        <section className="panel fa-panel">
          <h3>{t('folderAccess.person.addTitle')}</h3>
          <AddToFolder person={person} onChanged={load} />
        </section>
      )}
      <section className="panel">
        <Table
          rowKey={(row) => row.group.dn}
          dataSource={access}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('folderAccess.person.none')} /> }}
          columns={[
            {
              title: t('folderAccess.folder'),
              render: (_, row) => (
                <div className="fa-folder-cell">
                  {row.folderKey ? <Link to={folderUrl(row.folderKey)}>{row.path || row.folderName}</Link> : row.path || row.folderName}
                  <span className="fa-muted">{[row.group.name, row.project].filter(Boolean).join(' · ')}</span>
                </div>
              ),
            },
            { title: t('folderAccess.access'), width: 140, render: (_, row) => <TypeTag type={row.group.kind === 'other' ? null : row.type} /> },
            {
              title: '',
              width: 120,
              render: (_, row) => {
                if (!row.group.editable || !canWrite) {
                  return row.group.protected || row.group.root ? (
                    <Tooltip title={t('folderAccess.protected')}>
                      <LockOutlined className="fa-lock" />
                    </Tooltip>
                  ) : null;
                }
                const pair = pairOf[row.group.dn];
                const otherType = row.type === 'full' ? 'read' : 'full';
                const other = pair?.groups?.[otherType];
                return (
                  <span className="fa-row-actions">
                    {other?.editable && (
                      <Tooltip title={t('folderAccess.moveTo', { type: t(`folderAccess.type.${otherType}`) })}>
                        <Button size="small" type="text" icon={<SwapOutlined />} onClick={() => run(() => faApi.move(row.group.dn, other.dn, [person.dn]))} />
                      </Tooltip>
                    )}
                    <Popconfirm title={t('folderAccess.removeFrom', { name: row.group.name })} onConfirm={() => run(() => faApi.members(row.group.dn, [person.dn], 'remove'))}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('folderAccess.remove')} />
                    </Popconfirm>
                  </span>
                );
              },
            },
          ]}
        />
      </section>
      <CopyDialog open={copying} person={person} onClose={(done) => { setCopying(false); if (done) load(); }} />
    </div>
  );
}
