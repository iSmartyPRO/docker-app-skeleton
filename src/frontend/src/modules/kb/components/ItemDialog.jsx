import { useEffect, useRef, useState } from 'react';
import { App, Form, Input, Modal, Segmented } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { kbApi } from '../api';
import Markdown from '../viewers/Markdown';

const TOOLS = [
  ['B', '**', '**'],
  ['I', '_', '_'],
  ['H', '## ', ''],
  ['•', '- ', ''],
  ['1.', '1. ', ''],
  ['❝', '> ', ''],
  ['</>', '`', '`'],
  ['🔗', '[', '](https://)'],
  ['▦', '\n| Column | Column |\n|--------|--------|\n| Cell   | Cell   |\n', ''],
];

/** Markdown editor with a formatting toolbar and live preview (tabs on phones). */
function MarkdownEditor({ value = '', onChange }) {
  const { t } = useLocale();
  const ref = useRef(null);
  const [mode, setMode] = useState('write');

  const wrap = (before, after) => {
    const textarea = ref.current?.resizableTextArea?.textArea;
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange?.(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  return (
    <div className={`md-editor is-${mode}`}>
      <div className="md-editor__bar">
        {TOOLS.map(([label, before, after]) => (
          <button key={label} type="button" onClick={() => wrap(before, after)}>
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: t('kb.write') },
            { value: 'split', label: t('kb.split') },
            { value: 'preview', label: t('kb.preview') },
          ]}
        />
      </div>
      <div className="md-editor__panes">
        <Input.TextArea ref={ref} value={value} onChange={(event) => onChange?.(event.target.value)} className="md-editor__input" placeholder={t('kb.articlePlaceholder')} />
        <div className="md-editor__preview">
          <Markdown text={value || `_${t('kb.nothingYet')}_`} />
        </div>
      </div>
    </div>
  );
}

/** New / edit article or link. */
export default function ItemDialog({ open, kind, item, folderId, onClose, onSaved }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isArticle = (item?.kind || kind) === 'article';

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      title: item?.title || '',
      description: item?.description || '',
      content: item?.content || '',
      url: item?.url || '',
    });
  }, [open, item, form]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (item?.id) {
        await kbApi.updateItem(item.id, values);
        onSaved(item.id);
      } else {
        const res = await kbApi.createItem({ ...values, kind: isArticle ? 'article' : 'link', folderId });
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
      okText={item?.id ? t('common.save') : t('common.create')}
      cancelText={t('common.cancel')}
      title={item?.id ? t('kb.edit') : isArticle ? t('kb.newArticle') : t('kb.newLink')}
      width={isArticle ? 1100 : 560}
      destroyOnHidden
      className={isArticle ? 'kb-article-modal' : ''}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="title" label={t('kb.title')} rules={[{ required: true, max: 200 }]}>
          <Input autoFocus maxLength={200} size="large" />
        </Form.Item>
        {!isArticle && (
          <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://" />
          </Form.Item>
        )}
        <Form.Item name="description" label={t('kb.description')}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        {isArticle && (
          <Form.Item name="content" noStyle>
            <MarkdownEditor />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
