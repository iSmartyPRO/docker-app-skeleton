import { useEffect, useState } from 'react';
import { Alert, Input, Modal } from 'antd';
import { useLocale } from '../../../../context/LocaleContext';
import { faApi, faError } from '../api';
import { useAccess } from '../AccessContext';

/**
 * Superadministrators: a new _full / _read pair for a folder (AD part; NTFS when the folder is on the
 * File server). `plan` = { path, code, derivedCode, project, ou, source, fromPath, suggestedName } from the
 * folder's «Доступ» panel: the project code and OU come from the groups of the folder or of a folder above
 * it (the code through the project aliases, e.g. wh → co), else from the settings; the dialog says which.
 */
export function CreatePairDialog({ open, plan, onClose }) {
  const { t } = useLocale();
  const { info, change } = useAccess();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => {
    if (open) {
      setName(plan?.suggestedName || '');
      setCode(plan?.code || info?.config?.defaultProject || '');
      setDone(null);
    }
  }, [open, plan, info]);
  const prefix = info?.config?.prefix || 'sg_';
  const slug = name.trim().toLowerCase();
  const project = code.trim().toLowerCase();
  const path = plan?.path || '';
  const valid = /^[a-z0-9][a-z0-9-]{0,40}(?:_[a-z0-9-]{1,40})*$/.test(slug) && /^[a-z0-9-]{1,16}$/.test(project) && Boolean(plan?.ou);
  const submit = async () => {
    setBusy(true);
    const data = await change(() => faApi.createPair({ name: slug, path, project, ou: plan?.ou }), { quiet: true });
    setBusy(false);
    if (data) setDone(data);
  };
  if (done) {
    const ntfs = done.ntfs || {};
    return (
      <Modal open={open} onCancel={() => onClose(true)} onOk={() => onClose(true)} cancelButtonProps={{ style: { display: 'none' } }} title={t('folderAccess.create.title')}>
        <Alert type="success" showIcon message={t('folderAccess.create.created', { groups: (done.groups || []).map((group) => group.name).join(', ') })} description={done.ou ? <code className="fa-code">{done.ou}</code> : null} />
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
  const template = String(info?.config?.nameTemplate || '{prefix}{project}_{name}_{type}').replace('{org}', '{project}');
  const fill = (type) => template.replace('{prefix}', prefix).replace('{project}', project || '…').replace('{name}', slug || '…').replace('{type}', type);
  return (
    <Modal
      open={open}
      onCancel={() => onClose(false)}
      onOk={submit}
      okText={t('folderAccess.create.submit')}
      okButtonProps={{ loading: busy, disabled: !valid }}
      title={t('folderAccess.create.title')}
      destroyOnHidden
    >
      <p className="fa-muted">{t('folderAccess.create.lead')}</p>
      <div className="fa-form">
        <label>
          <span>{t('folderAccess.create.path')}</span>
          <code className="fa-code">{path}</code>
        </label>
        <div className="fa-form__row">
          <label>
            <span>{t('folderAccess.create.project')}</span>
            <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="obj2" style={{ width: 120 }} />
          </label>
          <label style={{ flex: 1 }}>
            <span>{t('folderAccess.create.name')}</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="buh" autoFocus />
          </label>
        </div>
        <label>
          <span>{t('folderAccess.create.ou')}</span>
          {plan?.ou ? <code className="fa-code">{plan.ou}</code> : <span className="fa-danger">{t('folderAccess.create.noOu')}</span>}
          {plan?.ou && (
            <span className="fa-muted fa-create-where">
              {plan.project && <>{t('folderAccess.create.whereProject', { project: plan.project })} </>}
              {plan.source === 'folder' && plan.fromPath ? t('folderAccess.create.whereFolder', { path: plan.fromPath }) : t('folderAccess.create.whereSettings')}
            </span>
          )}
          {plan?.derivedCode && plan.code && <span className="fa-muted fa-create-where">{t('folderAccess.create.aliased', { from: plan.derivedCode, to: plan.code })}</span>}
        </label>
        {slug && (
          <div className="fa-preview">
            <code>{fill('full')}</code> — {path};Full Access
            <br />
            <code>{fill('read')}</code> — {path};Read Only
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Superadministrators: edit a group's description (folder path;access type). */
export function DescriptionDialog({ group, onClose }) {
  const { t } = useLocale();
  const { change } = useAccess();
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
  const { change } = useAccess();
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
