import { useEffect, useMemo, useState } from 'react';
import { App, ColorPicker, Form, Input, Modal } from 'antd';
import { ICON_IDS, MenuIcon } from '../../../components/icons/menuIcons';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { kbApi } from '../api';
import { FOLDER_COLORS } from '../fileTypes';
import { FolderIcon } from './Icons';
import { HintLabel } from '../../../help/Hint';

/** Create or edit a folder: name, description, icon and colour with live preview. */
export default function FolderDialog({ open, folder, parentId, config, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const icon = Form.useWatch('icon', form);
  const color = Form.useWatch('color', form);
  const name = Form.useWatch('name', form);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    form.setFieldsValue({
      name: folder?.name || '',
      description: folder?.description || '',
      icon: folder?.icon || null,
      color: folder?.color || null,
    });
  }, [open, folder, form]);

  const icons = useMemo(() => ICON_IDS.filter((id) => id.includes(query.toLowerCase())), [query]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (folder?.id) {
        await kbApi.updateFolder(folder.id, values);
        onSaved(folder.id);
      } else {
        const res = await kbApi.createFolder({ ...values, parentId });
        onSaved(res.data.id);
      }
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={save}
      confirmLoading={saving}
      okText={folder?.id ? t('common.save') : t('common.create')}
      cancelText={t('common.cancel')}
      title={folder?.id ? t('kb.editFolder') : t('kb.newFolder')}
      width={560}
      destroyOnHidden
    >
      <div className="folder-preview">
        <FolderIcon folder={{ icon, color }} config={config} size={56} />
        <div>
          <strong>{name || t('kb.untitled')}</strong>
          <span>{t('kb.folderPreview')}</span>
        </div>
      </div>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label={t('kb.name')} rules={[{ required: true, max: 120 }]}>
          <Input autoFocus maxLength={120} />
        </Form.Item>
        <Form.Item name="description" label={t('kb.description')}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="color" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="icon" hidden>
          <Input />
        </Form.Item>
        <Form.Item label={t('kb.color')}>
          <div className="swatches">
            <button type="button" className={`swatch is-auto${!color ? ' is-active' : ''}`} onClick={() => form.setFieldValue('color', null)} title={t('kb.default')}>
              A
            </button>
            {FOLDER_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className={`swatch${color === value ? ' is-active' : ''}`}
                style={{ background: value }}
                onClick={() => form.setFieldValue('color', value)}
                aria-label={value}
              />
            ))}
            <ColorPicker
              value={color && !FOLDER_COLORS.includes(color) ? color : undefined}
              onChangeComplete={(value) => form.setFieldValue('color', value.toHexString().toUpperCase())}
              disabledAlpha
              size="small"
            />
          </div>
        </Form.Item>
        <Form.Item label={<HintLabel id="kb.folderIcon">{t('kb.icon')}</HintLabel>} extra={t('kb.iconHint')}>
          <div>
            <Input.Search size="small" placeholder={t('common.search')} value={query} onChange={(event) => setQuery(event.target.value)} allowClear style={{ marginBottom: 8 }} />
            <div className="icon-catalog icon-catalog--wide">
              <button type="button" className={`icon-catalog__btn${!icon ? ' is-active' : ''}`} onClick={() => form.setFieldValue('icon', null)} title={t('kb.default')}>
                <MenuIcon name={config?.defaultIcon || 'folder'} variant="mono" />
              </button>
              {icons.map((id) => (
                <button key={id} type="button" className={`icon-catalog__btn${icon === id ? ' is-active' : ''}`} onClick={() => form.setFieldValue('icon', id)} title={id}>
                  <MenuIcon name={id} variant="mono" />
                </button>
              ))}
            </div>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}
