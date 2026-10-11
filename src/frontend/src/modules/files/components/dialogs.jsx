import { useEffect, useState } from 'react';
import { App, Button, Input, Modal } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { filesApi } from '../api';
import FolderBrowser from './FolderBrowser';

/** Name a new folder or rename a node. Keeps the extension selected-out for files. */
export function NameDialog({ open, title, initial = '', onSubmit, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onSubmit(value.trim());
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} title={title} onCancel={() => onClose(false)} onOk={submit} okText={t('common.save')} cancelText={t('common.cancel')} confirmLoading={busy} destroyOnHidden width={440}>
      <Input
        autoFocus
        value={value}
        maxLength={255}
        onChange={(event) => setValue(event.target.value)}
        onPressEnter={submit}
        onFocus={(event) => {
          const dot = initial.lastIndexOf('.');
          if (dot > 0) event.target.setSelectionRange(0, dot);
        }}
      />
    </Modal>
  );
}

/** Choose where to move nodes: any folder or root you can edit. */
export function MoveDialog({ open, nodes, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!target) return;
    const move = target.folderId ? { parentId: target.folderId } : target.spaceId ? { spaceId: target.spaceId } : {};
    setBusy(true);
    try {
      for (const node of nodes) await filesApi.move(node.id, move);
      message.success(t('files.moved'));
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const writable = target && (target.type !== 'shared' || target.folderId) && ['edit', 'manage'].includes(target.level);
  return (
    <Modal
      open={open}
      title={t('files.moveTitle', { n: nodes?.length || 0 })}
      onCancel={() => onClose(false)}
      destroyOnHidden
      width={760}
      footer={[
        <span key="where" className="fs-move__where">{target?.label ? `→ ${target.label}` : ''}</span>,
        <Button key="cancel" onClick={() => onClose(false)}>{t('common.cancel')}</Button>,
        <Button key="ok" type="primary" disabled={!writable} loading={busy} onClick={submit}>{t('files.moveHere')}</Button>,
      ]}
    >
      <FolderBrowser
        mode="folder"
        exclude={nodes?.length === 1 ? nodes[0].id : undefined}
        onPlace={(place, data) =>
          setTarget({ ...place, level: data?.level || (place.type === 'shared' ? 'view' : 'manage'), label: data?.folder?.name || data?.root?.space?.name || (place.type === 'my' ? t('files.myFiles') : '') })
        }
      />
    </Modal>
  );
}

/**
 * Pick files from Files (used by the knowledge base). Resolves the chosen nodes.
 * `accept(node)` filters files, e.g. images only.
 */
export function FilePicker({ open, title, multiple = true, accept, okText, onPick, onClose }) {
  const { t } = useLocale();
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setChosen([]);
  }, [open]);
  return (
    <Modal
      open={open}
      title={title || t('files.pickTitle')}
      onCancel={onClose}
      destroyOnHidden
      width={820}
      className="fs-picker"
      footer={[
        <span key="count" className="fs-move__where">{chosen.length ? t('files.selectedN', { n: chosen.length }) : t('files.pickHint')}</span>,
        <Button key="cancel" onClick={onClose}>{t('common.cancel')}</Button>,
        <Button
          key="ok"
          type="primary"
          disabled={!chosen.length}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onPick(chosen);
            } finally {
              setBusy(false);
            }
          }}
        >
          {okText || t('files.pickOk')}
        </Button>,
      ]}
    >
      <FolderBrowser mode="files" multiple={multiple} accept={accept} onSelection={setChosen} />
    </Modal>
  );
}
