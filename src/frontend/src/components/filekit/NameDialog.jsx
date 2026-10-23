import { useEffect, useState } from 'react';
import { App, Input, Modal } from 'antd';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';

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
