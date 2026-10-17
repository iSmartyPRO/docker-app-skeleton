import { useEffect, useState } from 'react';
import { App, Button, Input, Modal, Popover, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { ColorSwatches } from '../../shared/People';
import { tasksApi } from '../api';

const CATEGORIES = ['todo', 'active', 'done'];

/** Edits the project workflow: names, colours, order and what counts as "done". */
export default function StatusesDialog({ open, project, statuses, onClose }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setList(statuses.map((status) => ({ ...status })));
  }, [open, statuses]);

  const patch = (index, change) => setList((prev) => prev.map((item, position) => (position === index ? { ...item, ...change } : item)));
  const move = (index, delta) =>
    setList((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await tasksApi.saveStatuses(project.key, list);
      message.success(t('common.saved'));
      onClose(true);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('tasks.workflow')}
      onCancel={() => onClose(false)}
      onOk={save}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      confirmLoading={saving}
      width={600}
      destroyOnHidden
    >
      <p className="dialog-lead">{t('tasks.workflowLead')}</p>
      <div className="status-editor">
        {list.map((status, index) => (
          <div key={status.id || `new-${index}`} className="status-editor__row">
            <div className="status-editor__order">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>▲</button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === list.length - 1}>▼</button>
            </div>
            <Popover trigger="click" content={<ColorSwatches small value={status.color} onChange={(color) => patch(index, { color })} />}>
              <button type="button" className="status-editor__color" style={{ background: status.color }} aria-label={t('common.a11y.color')} />
            </Popover>
            <Input value={status.name} maxLength={60} onChange={(event) => patch(index, { name: event.target.value })} />
            <Select
              value={status.category}
              style={{ width: 150 }}
              onChange={(category) => patch(index, { category })}
              options={CATEGORIES.map((category) => ({ value: category, label: t(`tasks.category.${category}`) }))}
            />
            <Button type="text" danger disabled={list.length <= 1} onClick={() => setList((prev) => prev.filter((_, position) => position !== index))}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Button onClick={() => setList((prev) => [...prev, { name: '', color: '#94A3B8', category: 'active' }])} disabled={list.length >= 12} icon={<PlusOutlined />}>
        {t('tasks.addStatus')}
      </Button>
      <p className="dialog-note">{t('tasks.workflowNote')}</p>
    </Modal>
  );
}
