import { useEffect, useState } from 'react';
import { Alert, Input, Modal } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { faApi, faError } from '../api';
import { useFolderAccess } from '../FolderAccessContext';

/** Superadministrators: a new _full / _read pair for a folder (AD part; NTFS when the engine is there). */
export function CreatePairDialog({ open, onClose }) {
  const { t } = useLocale();
  const { info, change } = useFolderAccess();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => {
    if (open) {
      setName('');
      setPath('');
      setDone(null);
    }
  }, [open]);
  const org = info?.config?.orgCode || 'co';
  const prefix = info?.config?.prefix || 'sg_';
  const slug = name.trim().toLowerCase();
  const submit = async () => {
    setBusy(true);
    const data = await change(() => faApi.createPair(slug, path.trim()), { quiet: true });
    setBusy(false);
    if (data) setDone(data);
  };
  if (done) {
    const ntfs = done.ntfs || {};
    return (
      <Modal open={open} onCancel={() => onClose(true)} onOk={() => onClose(true)} cancelButtonProps={{ style: { display: 'none' } }} title={t('folderAccess.create.title')}>
        <Alert type="success" showIcon message={t('folderAccess.create.created', { groups: (done.groups || []).map((group) => group.name).join(', ') })} />
        <Alert
          style={{ marginTop: 12 }}
          type={ntfs.status === 'applied' ? 'success' : 'warning'}
          showIcon
          message={t(`folderAccess.create.ntfs.${ntfs.status === 'applied' || ntfs.status === 'failed' ? ntfs.status : 'pending'}`)}
          description={ntfs.message || null}
        />
        {ntfs.propagationError && (
          <Alert style={{ marginTop: 12 }} type="warning" showIcon message={t('folderAccess.create.ntfs.propagationFailed')} description={faError({ response: { data: { code: ntfs.propagationError.code, error: ntfs.propagationError.message } } }, t)} />
        )}
        {ntfs.status === 'applied' && ntfs.journalId && <p className="fa-note">{t('folderAccess.create.ntfs.undoHint')}</p>}
      </Modal>
    );
  }
  return (
    <Modal
      open={open}
      onCancel={() => onClose(false)}
      onOk={submit}
      okText={t('folderAccess.create.submit')}
      okButtonProps={{ loading: busy, disabled: !slug || !/^[a-z]:/i.test(path.trim()) }}
      title={t('folderAccess.create.title')}
      destroyOnHidden
    >
      <p className="fa-muted">{t('folderAccess.create.lead')}</p>
      <div className="fa-form">
        <label>
          <span>{t('folderAccess.create.name')}</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="legal" autoFocus />
        </label>
        <label>
          <span>{t('folderAccess.create.path')}</span>
          <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="W:\07-LEGAL" />
        </label>
        {slug && (
          <div className="fa-preview">
            <code>{`${prefix}${org}_${slug}_full`}</code> — {path.trim() || 'W:\\…'};Full Access
            <br />
            <code>{`${prefix}${org}_${slug}_read`}</code> — {path.trim() || 'W:\\…'};Read Only
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Superadministrators: edit a group's description (folder path;access type). */
export function DescriptionDialog({ group, onClose }) {
  const { t } = useLocale();
  const { change } = useFolderAccess();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (group) setText(group.description || '');
  }, [group]);
  if (!group) return null;
  const submit = async () => {
    setBusy(true);
    const data = await change(() => faApi.describe(group.dn, text));
    setBusy(false);
    if (data) onClose(true);
  };
  return (
    <Modal open onCancel={() => onClose(false)} onOk={submit} okButtonProps={{ loading: busy }} title={t('folderAccess.describe.title', { name: group.name })}>
      <p className="fa-muted">{t('folderAccess.describe.lead')}</p>
      <Input value={text} onChange={(event) => setText(event.target.value)} maxLength={1024} placeholder="W:\06-HR;Full Access" />
    </Modal>
  );
}

/** Superadministrators: delete a group; the name has to be typed. */
export function DeleteGroupDialog({ group, onClose }) {
  const { t } = useLocale();
  const { change } = useFolderAccess();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setConfirm('');
  }, [group]);
  if (!group) return null;
  const submit = async () => {
    setBusy(true);
    const data = await change(() => faApi.deleteGroup(group.dn, confirm));
    setBusy(false);
    if (data) onClose(true);
  };
  return (
    <Modal
      open
      onCancel={() => onClose(false)}
      onOk={submit}
      okText={t('folderAccess.delete.submit')}
      okButtonProps={{ danger: true, loading: busy, disabled: confirm.trim().toLowerCase() !== group.name.toLowerCase() }}
      title={t('folderAccess.delete.title', { name: group.name })}
    >
      <Alert type="error" showIcon message={t('folderAccess.delete.warning', { n: group.memberCount })} style={{ marginBottom: 12 }} />
      <p>{t('folderAccess.delete.typeName', { name: group.name })}</p>
      <Input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={group.name} />
    </Modal>
  );
}
