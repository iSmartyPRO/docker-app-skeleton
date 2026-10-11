import { useMemo, useState } from 'react';
import { App, Modal, TreeSelect } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { atLeast, useKb } from '../KbContext';

/** Move a folder or material into another folder the user can edit. */
export default function MoveDialog({ open, target, onClose, onMoved, move }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const { tree, rootLevel } = useKb();
  const [value, setValue] = useState();
  const [saving, setSaving] = useState(false);

  const data = useMemo(() => {
    const blocked = new Set();
    if (target?.type === 'folder') {
      // A folder cannot go into itself or its descendants.
      const stack = [target.id];
      while (stack.length) {
        const id = stack.pop();
        blocked.add(id);
        tree.filter((folder) => folder.parentId === id).forEach((folder) => stack.push(folder.id));
      }
    }
    const build = (parentId) =>
      tree
        .filter((folder) => (folder.parentId || null) === parentId)
        .map((folder) => ({
          value: folder.id,
          title: folder.name,
          disabled: blocked.has(folder.id) || !atLeast(folder.level, 'edit'),
          children: build(folder.id),
        }));
    const nodes = build(null);
    return target?.type === 'folder'
      ? [{ value: 0, title: t('kb.topLevel'), disabled: !atLeast(rootLevel, 'edit'), children: nodes }]
      : nodes;
  }, [tree, target, rootLevel, t]);

  const save = async () => {
    setSaving(true);
    try {
      await move(value);
      onMoved();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={save} okButtonProps={{ disabled: value === undefined }} confirmLoading={saving} title={t('kb.moveTo')} okText={t('kb.move')} cancelText={t('common.cancel')} destroyOnHidden>
      <TreeSelect
        style={{ width: '100%' }}
        treeData={data}
        value={value}
        onChange={setValue}
        treeDefaultExpandAll
        placeholder={t('kb.chooseFolder')}
        showSearch
        treeNodeFilterProp="title"
      />
    </Modal>
  );
}
