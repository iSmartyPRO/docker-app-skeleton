import { useState } from 'react';
import { App, Button, Input, Modal, Popconfirm } from 'antd';
import { DeleteOutlined, EditOutlined, FolderOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { remoteApi } from '../api';
import { useRemote } from '../RemoteContext';

/** Chip row to filter by folder, plus folder management for administrators. */
export default function FolderBar({ value, onChange, countFor }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const remote = useRemote();
  const [manage, setManage] = useState(false);

  const chip = (key, label, count) => (
    <button key={key} type="button" className={`rm-chip-folder${String(value) === String(key) ? ' is-on' : ''}`} onClick={() => onChange(key)}>
      {label}{count != null && <span className="rm-chip-folder__n">{count}</span>}
    </button>
  );

  return (
    <div className="rm-folderbar">
      {chip('all', t('remote.folders.all'), countFor?.('all'))}
      {remote.folders.map((f) => chip(f.id, f.name, countFor?.(f.id)))}
      {remote.folders.length > 0 && chip('none', t('remote.folders.none'), countFor?.('none'))}
      {remote.can.admin && (
        <Button size="small" type="text" icon={<FolderOutlined />} onClick={() => setManage(true)} className="rm-folderbar__manage">{t('remote.folders.manage')}</Button>
      )}
      <FoldersDialog open={manage} onClose={() => { setManage(false); remote.refresh(); }} />
    </div>
  );
}

function FoldersDialog({ open, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const remote = useRemote();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);

  const add = async () => {
    if (!name.trim()) return;
    try { await remoteApi.saveFolder({ name: name.trim() }); setName(''); remote.refresh(); }
    catch (err) { message.error(errorMessage(err)); }
  };
  const rename = async (f, newName) => {
    try { await remoteApi.updateFolder(f.id, { name: newName }); setEditing(null); remote.refresh(); }
    catch (err) { message.error(errorMessage(err)); }
  };
  const remove = async (f) => {
    try { await remoteApi.deleteFolder(f.id); remote.refresh(); }
    catch (err) { message.error(errorMessage(err)); }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={[<Button key="c" type="primary" onClick={onClose}>{t('common.close')}</Button>]} title={t('remote.folders.title')} width={440} destroyOnHidden>
      <p className="rm-muted">{t('remote.folders.lead')}</p>
      <div className="rm-folder-list">
        {remote.folders.map((f) => (
          <div key={f.id} className="rm-folder-row">
            <FolderOutlined />
            {editing === f.id ? (
              <Input size="small" defaultValue={f.name} autoFocus onPressEnter={(e) => rename(f, e.target.value)} onBlur={(e) => rename(f, e.target.value)} style={{ flex: 1 }} />
            ) : (
              <span className="rm-folder-row__name">{f.name}</span>
            )}
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(f.id)} aria-label={t('common.edit')} />
            <Popconfirm title={t('remote.folders.deleteConfirm')} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={() => remove(f)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
            </Popconfirm>
          </div>
        ))}
      </div>
      <div className="rm-folder-add">
        <Input value={name} onChange={(e) => setName(e.target.value)} onPressEnter={add} placeholder={t('remote.folders.newName')} />
        <Button icon={<PlusOutlined />} onClick={add} disabled={!name.trim()}>{t('remote.folders.add')}</Button>
      </div>
    </Modal>
  );
}

/** antd menu items to move an item (host/app) into a folder. */
export function moveMenuItems(remote, kind, id, t, onDone) {
  const move = async (folderId) => {
    try { await remoteApi.move({ kind, id, folderId }); onDone?.(); } catch { /* ignore */ }
  };
  return {
    key: 'move',
    icon: <FolderOutlined />,
    label: t('remote.folders.moveTo'),
    children: [
      { key: 'move-none', label: t('remote.folders.none'), onClick: () => move(null) },
      ...remote.folders.map((f) => ({ key: `move-${f.id}`, label: f.name, onClick: () => move(f.id) })),
    ],
  };
}
