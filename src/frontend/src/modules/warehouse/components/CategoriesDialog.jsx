import { useEffect, useState } from 'react';
import { App, Button, Input, Modal, Select, TreeSelect } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useLocale } from '../../../context/LocaleContext';
import { whApi } from '../api';
import { categoryTree, whError } from '../lib';

/** The category tree with custom attributes per category («Цемент: марка, вес мешка»). */
export default function CategoriesDialog({ onClose }) {
  const { t } = useLocale();
  const { message, modal } = App.useApp();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => whApi.categories().then((res) => setList(res.data.categories)).catch((err) => message.error(whError(err, t)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async () => {
    try {
      const res = await whApi.saveCategory(edit.id, { name: edit.name, parentId: edit.parentId, attrs: edit.attrs });
      setList(res.data.categories);
      setEdit(null);
    } catch (err) {
      message.error(whError(err, t));
    }
  };
  const remove = (category) =>
    modal.confirm({
      title: t('wh.categories.deleteTitle', { name: category.name }),
      content: t('wh.categories.deleteText'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => whApi.deleteCategory(category.id).then((res) => setList(res.data.categories)).catch((err) => message.error(whError(err, t))),
    });
  const depth = (category) => {
    let n = 0;
    let parent = category.parentId;
    while (parent && n < 8) {
      n += 1;
      parent = list.find((c) => c.id === parent)?.parentId;
    }
    return n;
  };
  const ordered = [];
  const walk = (parent) => (list || []).filter((c) => (c.parentId || null) === parent).forEach((c) => { ordered.push(c); walk(c.id); });
  if (list) walk(null);
  const setAttr = (index, patch) => setEdit({ ...edit, attrs: edit.attrs.map((a, i) => (i === index ? { ...a, ...patch } : a)) });
  return (
    <Modal open onCancel={onClose} footer={null} title={t('wh.items.categories')} width={640} destroyOnClose>
      <ul className="wh-cats">
        {ordered.filter((c) => !c.archived).map((c) => (
          <li key={c.id} style={{ paddingLeft: depth(c) * 18 }}>
            <span>{c.name}</span>
            {c.attrs.length > 0 && <em>{c.attrs.map((a) => a.label).join(', ')}</em>}
            <Button size="small" type="text" onClick={() => setEdit({ ...c, attrs: c.attrs.map((a) => ({ ...a, options: a.options || [] })) })}>✎</Button>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(c)} aria-label={t('common.delete')} />
          </li>
        ))}
      </ul>
      {edit ? (
        <div className="wh-subform">
          <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t('wh.categories.name')} maxLength={120} autoFocus />
          <TreeSelect allowClear value={edit.parentId ?? undefined} onChange={(parentId) => setEdit({ ...edit, parentId: parentId ?? null })} treeData={categoryTree((list || []).filter((c) => c.id !== edit.id))} placeholder={t('wh.categories.parent')} treeDefaultExpandAll />
          <strong>{t('wh.categories.attrs')}</strong>
          {edit.attrs.map((attr, index) => (
            <div key={index} className="wh-subform__row">
              <Input value={attr.label} onChange={(e) => setAttr(index, { label: e.target.value })} placeholder={t('wh.categories.attrLabel')} maxLength={60} />
              <Select value={attr.type} onChange={(type) => setAttr(index, { type })} options={['text', 'number', 'select'].map((value) => ({ value, label: t(`wh.categories.types.${value}`) }))} style={{ width: 130 }} />
              {attr.type === 'select' && <Select mode="tags" value={attr.options} onChange={(options) => setAttr(index, { options })} placeholder={t('wh.categories.options')} style={{ minWidth: 160 }} />}
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setEdit({ ...edit, attrs: edit.attrs.filter((_, i) => i !== index) })} />
            </div>
          ))}
          <Button size="small" icon={<PlusOutlined />} onClick={() => setEdit({ ...edit, attrs: [...edit.attrs, { label: '', type: 'text', options: [] }] })}>{t('wh.categories.addAttr')}</Button>
          <div className="wh-subform__row">
            <Button type="primary" onClick={save} disabled={!String(edit.name || '').trim()}>{t('common.save')}</Button>
            <Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
          </div>
        </div>
      ) : (
        <Button icon={<PlusOutlined />} onClick={() => setEdit({ id: null, name: '', parentId: null, attrs: [] })}>{t('wh.categories.add')}</Button>
      )}
    </Modal>
  );
}
