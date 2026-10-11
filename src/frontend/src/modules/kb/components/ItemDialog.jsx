import { useEffect, useRef, useState } from 'react';
import { App, Button, Form, Input, Modal, Segmented, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { kbApi } from '../api';
import Markdown from '../viewers/Markdown';
import { useSettings } from '../../../context/SettingsContext';
import { FilePicker } from '../../files/components/dialogs';
import { FileIcon } from './Icons';
import { formatSize } from '../fileTypes';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

/** Markdown for a file from Files: images are shown, other files become links. */
function fileMarkdown(node) {
  const name = node.name.replace(/[[\]]/g, '');
  return IMAGE.has(node.file?.ext) ? `![${name}](kbfile:${node.id})` : `[📎 ${name}](kbfile:${node.id})`;
}

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
function MarkdownEditor({ value = '', onChange, onInsertFile, fileUrl }) {
  const { t } = useLocale();
  const ref = useRef(null);
  const [mode, setMode] = useState('write');
  const caret = useRef(null);

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
        {onInsertFile && (
          <Tooltip title={t('kb.insertFileHint')}>
            <button
              type="button"
              className="md-editor__file"
              onClick={() => {
                const textarea = ref.current?.resizableTextArea?.textArea;
                caret.current = textarea ? textarea.selectionStart : value.length;
                onInsertFile((markdown) => {
                  const at = caret.current ?? value.length;
                  onChange?.(`${value.slice(0, at)}${markdown}${value.slice(at)}`);
                });
              }}
            >
              📎 {t('kb.insertFile')}
            </button>
          </Tooltip>
        )}
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
          <Markdown text={value || `_${t('kb.nothingYet')}_`} fileUrl={fileUrl} />
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
  const [attachments, setAttachments] = useState([]);
  const [picker, setPicker] = useState(null);
  const { settings } = useSettings();
  const filesOn = Boolean(settings?.modules?.files?.enabled);
  const isArticle = (item?.kind || kind) === 'article';
  const attachedIds = new Set((item?.attachments || []).map((file) => file.nodeId));
  // Files already attached load through the article; new picks through Files.
  const fileUrl = (nodeId) =>
    item?.id && attachedIds.has(nodeId) ? `/api/app/kb/items/${item.id}/attachments/${nodeId}` : `/api/app/files/nodes/${nodeId}/file`;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      title: item?.title || '',
      description: item?.description || '',
      content: item?.content || '',
      url: item?.url || '',
    });
    setAttachments((item?.attachments || []).filter((file) => !file.inline).map((file) => ({ id: file.nodeId, name: file.name, file: { ext: file.ext, size: file.size } })));
  }, [open, item, form]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = isArticle ? { ...values, attachments: attachments.map((file) => file.id) } : values;
      if (item?.id) {
        await kbApi.updateItem(item.id, payload);
        onSaved(item.id);
      } else {
        const res = await kbApi.createItem({ ...payload, kind: isArticle ? 'article' : 'link', folderId });
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
            <MarkdownEditor fileUrl={fileUrl} onInsertFile={filesOn ? (insert) => setPicker({ mode: 'insert', insert }) : undefined} />
          </Form.Item>
        )}
        {isArticle && filesOn && (
          <div className="kb-attach-edit">
            <div className="kb-attach-edit__head">
              <strong>{t('kb.attachmentsTitle')}</strong>
              <Button size="small" onClick={() => setPicker({ mode: 'attach' })}>+ {t('kb.attachFiles')}</Button>
            </div>
            {attachments.length === 0 ? (
              <span className="kb-attach-edit__empty">{t('kb.attachHint')}</span>
            ) : (
              attachments.map((file) => (
                <div key={file.id} className="kb-attach-edit__row">
                  <FileIcon item={{ kind: 'file', file: file.file }} size={26} />
                  <span>{file.name}</span>
                  <em>{formatSize(file.file?.size)}</em>
                  <Button size="small" type="text" danger onClick={() => setAttachments((list) => list.filter((entry) => entry.id !== file.id))}>✕</Button>
                </div>
              ))
            )}
          </div>
        )}
      </Form>
      <FilePicker
        open={Boolean(picker)}
        title={picker?.mode === 'insert' ? t('kb.insertFile') : t('kb.attachFiles')}
        okText={picker?.mode === 'insert' ? t('kb.insert') : t('kb.attach')}
        onClose={() => setPicker(null)}
        onPick={(nodes) => {
          if (picker.mode === 'insert') picker.insert(nodes.map(fileMarkdown).join('\n\n'));
          else setAttachments((list) => [...list, ...nodes.filter((node) => !list.some((entry) => entry.id === node.id))]);
          setPicker(null);
        }}
      />
    </Modal>
  );
}
