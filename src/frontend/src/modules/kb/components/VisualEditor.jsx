import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { App, Dropdown, Select, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { fromEditorHtml, toEditorHtml } from './articleHtml';
import { KbImage } from './ImageNode';
import ImageToolbar from './ImageToolbar';

/*
 * Visual article editor (TipTap / ProseMirror) storing HTML. Files are kept in
 * the article as `kbfile:<id>` like in Markdown; while editing they point at
 * real URLs and carry `data-kbfile`, which is turned back on every change.
 * Pictures and files can be pasted, dropped, uploaded or chosen from Files.
 */

// `data-kbfile` survives editing on links (pictures: see ImageNode).
const kbfileAttr = {
  kbfile: {
    default: null,
    parseHTML: (element) => element.getAttribute('data-kbfile'),
    renderHTML: (attrs) => (attrs.kbfile ? { 'data-kbfile': attrs.kbfile } : {}),
  },
};
const KbLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), ...kbfileAttr };
  },
});

// Three lines per alignment icon: [x, width].
const ALIGN_LINES = {
  left: [[1, 14], [1, 9], [1, 12]],
  center: [[1, 14], [3.5, 9], [2, 12]],
  right: [[1, 14], [6, 9], [3, 12]],
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const isImage = (node) => IMAGE_EXT.test(node.name || '') || /^image\//.test(node.file?.mime || '');

function Tool({ title, active, onClick, children, disabled }) {
  return (
    <Tooltip title={title} mouseEnterDelay={0.4}>
      <button
        type="button"
        className={`ve-tool${active ? ' is-on' : ''}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        aria-label={typeof title === 'string' ? title : undefined}
        aria-pressed={active ? 'true' : undefined}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function MenuTool({ title, items, children, active }) {
  return (
    <Dropdown menu={{ items }} trigger={['click']}>
      <Tooltip title={title} mouseEnterDelay={0.4}>
        <button type="button" className={`ve-tool ve-tool--menu${active ? ' is-on' : ''}`} onMouseDown={(event) => event.preventDefault()} aria-label={title}>
          {children}
          <span className="ve-caret">▾</span>
        </button>
      </Tooltip>
    </Dropdown>
  );
}

/**
 * @param value     article HTML with kbfile:<id> references
 * @param onChange  receives the same form
 * @param fileUrl   nodeId → URL to show a file while editing
 * @param upload    (File[]) → Promise<[{ id, name, file }]>; absent = no uploads
 * @param onPickFiles  (mode: 'image'|'file', insert(nodes)) → opens the Files picker; absent = Files is off
 */
export default function VisualEditor({ value = '', onChange, fileUrl, upload, onPickFiles }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(0);
  const [full, setFull] = useState(false);
  const [scrollBox, setScrollBox] = useState(null);
  const imageInput = useRef(null);
  const fileInput = useRef(null);
  const replaceInput = useRef(null);
  const replaceAt = useRef(null);
  const previews = useRef(new Map());
  const last = useRef(value);
  const uploadRef = useRef(upload);
  uploadRef.current = upload;

  const urlOf = (id) => previews.current.get(Number(id)) || fileUrl(Number(id));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      KbLink.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      KbImage.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: t('kb.ve.placeholder') }),
    ],
    content: toEditorHtml(value, urlOf),
    onUpdate: ({ editor: instance }) => {
      const html = instance.isEmpty ? '' : fromEditorHtml(instance.getHTML());
      last.current = html;
      onChange?.(html);
    },
    editorProps: {
      attributes: { class: 'kb-prose ve-content' },
      handlePaste: (view, event) => dropFiles(event.clipboardData?.files, null),
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        return dropFiles(event.dataTransfer?.files, at?.pos ?? null);
      },
    },
  });

  // A new value from outside (format switch) replaces the content.
  useEffect(() => {
    if (!editor || value === last.current) return;
    last.current = value;
    editor.commands.setContent(toEditorHtml(value, urlOf), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    if (!full) return undefined;
    const onKey = (event) => event.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  useEffect(
    () => () => {
      previews.current.forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  /** Inserts files from Files or fresh uploads at `pos` (or the cursor). */
  function insertNodes(nodes, pos = null) {
    if (!editor || !nodes.length) return;
    const content = [];
    nodes.forEach((node) => {
      if (isImage(node)) content.push({ type: 'image', attrs: { src: urlOf(node.id), alt: node.name.replace(/\.[^.]+$/, ''), kbfile: String(node.id) } });
      else
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `📎 ${node.name}`, marks: [{ type: 'link', attrs: { href: urlOf(node.id), kbfile: String(node.id), target: '_blank' } }] }],
        });
    });
    // Typing goes on below a picture instead of replacing the selected picture.
    if (content[content.length - 1].type === 'image') content.push({ type: 'paragraph' });
    const chain = editor.chain().focus();
    (pos === null ? chain : chain.setTextSelection(pos)).insertContent(content).run();
  }

  /** Puts another picture in place of the one at `pos` (size, layout, caption stay). */
  function replaceImage(pos, node) {
    if (!editor || typeof pos !== 'number' || !node) return;
    const current = editor.state.doc.nodeAt(pos);
    if (current?.type.name !== 'image') return;
    const attrs = node.url
      ? { src: node.url, kbfile: null }
      : { src: urlOf(node.id), kbfile: String(node.id), alt: node.name.replace(/\.[^.]+$/, '') };
    editor.chain().focus().setNodeSelection(pos).updateAttributes('image', attrs).run();
  }

  async function uploadFiles(list, pos = null, replace = false) {
    const files = [...(list || [])];
    if (!files.length || !uploadRef.current) return;
    setBusy((n) => n + files.length);
    const hide = message.loading(t('kb.ve.uploading', { name: files.length === 1 ? files[0].name : `${files.length}` }), 0);
    try {
      const nodes = await uploadRef.current(files);
      nodes.forEach((node, index) => {
        const source = files[index];
        if (source && isImage(node)) previews.current.set(node.id, URL.createObjectURL(source));
      });
      if (replace) replaceImage(pos, nodes.find(isImage));
      else insertNodes(nodes, pos);
      if (nodes.length > 1) message.success(t('kb.ve.uploaded', { n: nodes.length }));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      hide();
      setBusy((n) => Math.max(0, n - files.length));
    }
  }

  // Paste/drop handlers run inside ProseMirror: answer synchronously, upload in the background.
  function dropFiles(list, pos) {
    if (!list?.length || !uploadRef.current) return false;
    uploadFiles(list, pos);
    return true;
  }

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes('link').href || 'https://';
    // eslint-disable-next-line no-alert
    const url = window.prompt(t('kb.ve.linkPrompt'), previous);
    if (url === null) return;
    if (!url.trim() || url === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else if (/^(https?:|mailto:|#|\/)/i.test(url.trim())) editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  const imageByUrl = () => {
    // eslint-disable-next-line no-alert
    const url = window.prompt(t('kb.ve.imageUrlPrompt'), 'https://');
    if (url && /^https?:\/\//i.test(url.trim())) editor.chain().focus().setImage({ src: url.trim() }).run();
  };

  const replaceSelected = (how) => {
    const pos = editor.state.selection.from;
    if (how === 'upload') {
      replaceAt.current = pos;
      replaceInput.current?.click();
    } else if (how === 'files') onPickFiles?.('image', (nodes) => replaceImage(pos, nodes.find(isImage)));
    else {
      // eslint-disable-next-line no-alert
      const url = window.prompt(t('kb.ve.imageUrlPrompt'), 'https://');
      if (url && /^https?:\/\//i.test(url.trim())) replaceImage(pos, { url: url.trim() });
    }
  };

  const block = editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';
  const setBlock = (next) => {
    const chain = editor.chain().focus();
    if (next === 'p') chain.setParagraph().run();
    else chain.setHeading({ level: next === 'h2' ? 2 : 3 }).run();
  };
  const inTable = editor.isActive('table');
  const tableItems = inTable
    ? [
        { key: 'ra', label: t('kb.ve.tableRowAbove'), onClick: () => editor.chain().focus().addRowBefore().run() },
        { key: 'rb', label: t('kb.ve.tableRowBelow'), onClick: () => editor.chain().focus().addRowAfter().run() },
        { key: 'cl', label: t('kb.ve.tableColLeft'), onClick: () => editor.chain().focus().addColumnBefore().run() },
        { key: 'cr', label: t('kb.ve.tableColRight'), onClick: () => editor.chain().focus().addColumnAfter().run() },
        { type: 'divider' },
        { key: 'h', label: t('kb.ve.tableHeader'), onClick: () => editor.chain().focus().toggleHeaderRow().run() },
        { key: 'dr', label: t('kb.ve.tableDelRow'), onClick: () => editor.chain().focus().deleteRow().run() },
        { key: 'dc', label: t('kb.ve.tableDelCol'), onClick: () => editor.chain().focus().deleteColumn().run() },
        { key: 'dt', danger: true, label: t('kb.ve.tableDelete'), onClick: () => editor.chain().focus().deleteTable().run() },
      ]
    : [{ key: 'ins', label: t('kb.ve.tableInsert'), onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }];
  const imageItems = [
    upload && { key: 'up', label: t('kb.ve.imageUpload'), onClick: () => imageInput.current?.click() },
    onPickFiles && { key: 'files', label: t('kb.ve.imageFiles'), onClick: () => onPickFiles('image', (nodes) => insertNodes(nodes)) },
    { key: 'url', label: t('kb.ve.imageUrl'), onClick: imageByUrl },
  ].filter(Boolean);
  const fileItems = [
    upload && { key: 'up', label: t('kb.ve.fileUpload'), onClick: () => fileInput.current?.click() },
    onPickFiles && { key: 'files', label: t('kb.ve.fileFiles'), onClick: () => onPickFiles('file', (nodes) => insertNodes(nodes)) },
  ].filter(Boolean);
  const words = editor.state.doc.textContent.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className={`ve${full ? ' is-full' : ''}${busy ? ' is-busy' : ''}`}>
      <div className="ve-bar" role="toolbar">
        <Select
          size="small"
          value={block}
          onChange={setBlock}
          className="ve-block"
          popupMatchSelectWidth={false}
          options={[
            { value: 'p', label: t('kb.ve.paragraph') },
            { value: 'h2', label: <strong>{t('kb.ve.heading2')}</strong> },
            { value: 'h3', label: <span style={{ fontWeight: 600 }}>{t('kb.ve.heading3')}</span> },
          ]}
        />
        <span className="ve-sep" />
        <Tool title={t('kb.ve.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <b>B</b>
        </Tool>
        <Tool title={t('kb.ve.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </Tool>
        <Tool title={t('kb.ve.underline')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </Tool>
        <Tool title={t('kb.ve.strike')} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </Tool>
        <Tool title={t('kb.ve.highlight')} active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <span className="ve-mark">A</span>
        </Tool>
        <Tool title={t('kb.ve.code')} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          {'</>'}
        </Tool>
        <Tool title={t('kb.ve.link')} active={editor.isActive('link')} onClick={setLink}>
          🔗
        </Tool>
        <span className="ve-sep" />
        <Tool title={t('kb.ve.bullets')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          ••
        </Tool>
        <Tool title={t('kb.ve.numbers')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1.
        </Tool>
        <Tool title={t('kb.ve.todo')} active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          ☑
        </Tool>
        <Tool title={t('kb.ve.quote')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          ❝
        </Tool>
        <Tool title={t('kb.ve.codeBlock')} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          {'{ }'}
        </Tool>
        <Tool title={t('kb.ve.rule')} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          ―
        </Tool>
        <span className="ve-sep" />
        {['left', 'center', 'right'].map((side) => (
          <Tool
            key={side}
            title={t(`kb.ve.align${side[0].toUpperCase()}${side.slice(1)}`)}
            active={side !== 'left' && editor.isActive({ textAlign: side })}
            onClick={() => editor.chain().focus().setTextAlign(side).run()}
          >
            <svg className="ve-align" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              {ALIGN_LINES[side].map(([x, w], row) => (
                <rect key={row} x={x} y={2 + row * 4} width={w} height="1.8" rx="0.9" fill="currentColor" />
              ))}
            </svg>
          </Tool>
        ))}
        <span className="ve-sep" />
        <MenuTool title={t('kb.ve.image')} items={imageItems}>
          🖼
        </MenuTool>
        {fileItems.length > 0 && (
          <MenuTool title={t('kb.ve.file')} items={fileItems}>
            📎
          </MenuTool>
        )}
        <MenuTool title={t('kb.ve.table')} items={tableItems} active={inTable}>
          ▦
        </MenuTool>
        <span className="ve-spacer" />
        <Tool title={t('kb.ve.clear')} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          ⌫
        </Tool>
        <Tool title={t('kb.ve.undo')} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          ↶
        </Tool>
        <Tool title={t('kb.ve.redo')} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          ↷
        </Tool>
        <Tool title={full ? t('kb.ve.exitFullscreen') : t('kb.ve.fullscreen')} active={full} onClick={() => setFull((on) => !on)}>
          {full ? '⤡' : '⤢'}
        </Tool>
      </div>
      <div ref={setScrollBox} className="ve-scroll" onClick={(event) => event.target === event.currentTarget && editor.chain().focus('end').run()}>
        <EditorContent editor={editor} />
        {scrollBox && <ImageToolbar editor={editor} boundary={scrollBox} fileUrl={urlOf} onReplace={replaceSelected} canUpload={Boolean(upload)} canPick={Boolean(onPickFiles)} />}
      </div>
      <div className="ve-foot">
        <span>{t('kb.ve.words', { n: words })}</span>
        {busy > 0 && <span className="ve-foot__busy">⏳ {t('kb.ve.uploading', { name: busy > 1 ? `${busy}` : '' }).replace(/\s+…/, '…')}</span>}
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          uploadFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml"
        data-replace=""
        style={{ display: 'none' }}
        onChange={(event) => {
          uploadFiles(event.target.files, replaceAt.current, true);
          event.target.value = '';
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          uploadFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
