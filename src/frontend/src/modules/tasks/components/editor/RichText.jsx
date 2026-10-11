import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Mention from '@tiptap/extension-mention';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Button, Dropdown, Modal, Tooltip } from 'antd';
import { useLocale } from '../../../../context/LocaleContext';
import { UserAvatar } from '../../../shared/People';
import { usePeople } from './pickers';

/*
 * Task description: a visual editor (TipTap / ProseMirror) storing HTML.
 * Older Markdown descriptions are shown converted. Output is always sanitised.
 */

export function toHtml(text, format) {
  if (!text) return '';
  return format === 'html' ? text : marked.parse(String(text), { breaks: true });
}

export function SafeHtml({ html, className }) {
  const clean = useMemo(() => DOMPurify.sanitize(html || '', { ADD_ATTR: ['target', 'data-type', 'data-checked', 'data-id', 'data-label'] }), [html]);
  return <div className={`te-rich${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}

/** Popup list of people for @mentions (TipTap suggestion renderer). */
function mentionSuggestion(getPeople) {
  return {
    items: ({ query }) =>
      getPeople()
        .filter((user) => `${user.name} ${user.username}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6),
    render: () => {
      let root;
      let state = { items: [], index: 0, command: null, rect: null };
      const paint = () => {
        if (!root) return;
        const rect = state.rect?.();
        root.style.left = `${(rect?.left || 0) + window.scrollX}px`;
        root.style.top = `${(rect?.bottom || 0) + window.scrollY + 6}px`;
        root.innerHTML = '';
        if (!state.items.length) {
          root.style.display = 'none';
          return;
        }
        root.style.display = 'block';
        state.items.forEach((user, i) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = i === state.index ? 'is-active' : '';
          button.textContent = `${user.name} · @${user.username}`;
          button.onmousedown = (event) => {
            event.preventDefault();
            state.command({ id: user.username, label: user.name });
          };
          root.appendChild(button);
        });
      };
      return {
        onStart: (props) => {
          root = document.createElement('div');
          root.className = 'te-mentions';
          document.body.appendChild(root);
          state = { items: props.items, index: 0, command: props.command, rect: props.clientRect };
          paint();
        },
        onUpdate: (props) => {
          state = { ...state, items: props.items, command: props.command, rect: props.clientRect, index: 0 };
          paint();
        },
        onKeyDown: ({ event }) => {
          if (!state.items.length) return false;
          if (event.key === 'ArrowDown') state.index = (state.index + 1) % state.items.length;
          else if (event.key === 'ArrowUp') state.index = (state.index - 1 + state.items.length) % state.items.length;
          else if (event.key === 'Enter' || event.key === 'Tab') {
            const user = state.items[state.index];
            state.command({ id: user.username, label: user.name });
            return true;
          } else if (event.key === 'Escape') {
            root.style.display = 'none';
            return true;
          } else return false;
          paint();
          return true;
        },
        onExit: () => {
          root?.remove();
          root = null;
        },
      };
    },
  };
}

function Tool({ title, active, onClick, children, disabled }) {
  return (
    <Tooltip title={title} mouseEnterDelay={0.4}>
      <button type="button" className={`te-tool${active ? ' is-on' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    </Tooltip>
  );
}

const Editor = forwardRef(function Editor({ value, format, onChange, placeholder, onAttach, onChecklist, minHeight = 90, autoFocus, expanded, onExpand }, ref) {
  const { t } = useLocale();
  const people = usePeople();
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder: placeholder || '' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Mention.configure({ HTMLAttributes: { class: 'te-mention' }, renderText: ({ node }) => `@${node.attrs.id}`, suggestion: mentionSuggestion(() => peopleRef.current) }),
    ],
    content: toHtml(value, format),
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: instance }) => onChange?.(instance.isEmpty ? '' : instance.getHTML()),
  });

  useImperativeHandle(ref, () => ({ editor }), [editor]);

  // External value changes (a template applied) replace the content.
  const last = useRef(value);
  useEffect(() => {
    if (!editor || value === last.current) return;
    last.current = value;
    if ((editor.isEmpty ? '' : editor.getHTML()) !== toHtml(value, format)) editor.commands.setContent(toHtml(value, format), false);
  }, [value, format, editor]);
  useEffect(() => {
    if (editor) last.current = editor.isEmpty ? '' : editor.getHTML();
  });

  if (!editor) return null;
  const setLink = () => {
    const previous = editor.getAttributes('link').href || 'https://';
    // eslint-disable-next-line no-alert
    const url = window.prompt(t('tasks.v2.linkPrompt'), previous);
    if (url === null) return;
    if (!url || url === 'https://') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  // "Checklist from text": the selected lines (or the current paragraph) become checklist items.
  const toChecklist = () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n') || editor.state.selection.$from.parent.textContent;
    const lines = text.split('\n').map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);
    if (!lines.length) return;
    onChecklist?.(lines);
  };
  const more = {
    items: [
      { key: 'u', label: t('tasks.v2.fmt.underline'), onClick: () => editor.chain().focus().toggleUnderline().run() },
      { key: 's', label: t('tasks.v2.fmt.strike'), onClick: () => editor.chain().focus().toggleStrike().run() },
      { key: 'h', label: t('tasks.v2.fmt.heading'), onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
      { key: 'q', label: t('tasks.v2.fmt.quote'), onClick: () => editor.chain().focus().toggleBlockquote().run() },
      { key: 'c', label: t('tasks.v2.fmt.code'), onClick: () => editor.chain().focus().toggleCodeBlock().run() },
      { key: 'l', label: t('tasks.v2.fmt.link'), onClick: setLink },
      { key: 'tl', label: t('tasks.v2.fmt.todo'), onClick: () => editor.chain().focus().toggleTaskList().run() },
      { type: 'divider' },
      { key: 'clear', label: t('tasks.v2.fmt.clear'), onClick: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
    ],
  };
  return (
    <div className={`te-editor${expanded ? ' is-expanded' : ''}`}>
      <div className="te-editor__bar">
        {onAttach && (
          <Tool title={t('tasks.v2.attachFile')} onClick={onAttach}>
            📎
          </Tool>
        )}
        <Tool title={t('tasks.v2.mention')} onClick={() => editor.chain().focus().insertContent(' @').run()}>
          @
        </Tool>
        <span className="te-editor__sep" />
        <Tool title={t('tasks.v2.fmt.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <b>Ж</b>
        </Tool>
        <Tool title={t('tasks.v2.fmt.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <i>К</i>
        </Tool>
        <Tool title={t('tasks.v2.fmt.bullets')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          ••
        </Tool>
        <Tool title={t('tasks.v2.fmt.numbers')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1.
        </Tool>
        <Dropdown menu={more} trigger={['click']}>
          <button type="button" className="te-tool" onMouseDown={(event) => event.preventDefault()}>
            …
          </button>
        </Dropdown>
        {onChecklist && (
          <Tool title={t('tasks.v2.checklistFromText')} onClick={toChecklist}>
            ☑ <span className="te-tool__text">{t('tasks.v2.checklistShort')}</span>
          </Tool>
        )}
        <span className="te-editor__grow" />
        {onExpand && (
          <Tool title={t('tasks.v2.expand')} onClick={onExpand}>
            ⤢
          </Tool>
        )}
      </div>
      <EditorContent editor={editor} className="te-editor__content" style={{ minHeight }} />
    </div>
  );
});

/**
 * Description field: the editor in place, "Expand" opens a full-screen editor
 * with Save. `onCommit` (existing tasks) saves on blur; drafts use onChange.
 */
export default function RichText({ value, format = 'html', onChange, onCommit, placeholder, onAttach, onChecklist, readOnly, autoFocus }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(value || '');
  const [expanded, setExpanded] = useState(false);
  const [big, setBig] = useState('');
  const dirty = useRef(false);
  useEffect(() => {
    setDraft(value || '');
    dirty.current = false;
  }, [value]);
  if (readOnly) return value ? <SafeHtml html={toHtml(value, format)} /> : <div className="te-empty">{t('tasks.noDescription')}</div>;
  const change = (html) => {
    setDraft(html);
    dirty.current = true;
    onChange?.(html);
  };
  return (
    <div
      className="te-desc"
      onBlur={(event) => {
        if (onCommit && dirty.current && !event.currentTarget.contains(event.relatedTarget)) {
          dirty.current = false;
          onCommit(draft);
        }
      }}
    >
      <Editor
        value={draft}
        format={format}
        onChange={change}
        placeholder={placeholder}
        onAttach={onAttach}
        onChecklist={onChecklist}
        autoFocus={autoFocus}
        onExpand={() => {
          setBig(draft);
          setExpanded(true);
        }}
      />
      {expanded &&
        createPortal(
          <Modal
            open
            width="min(1100px, 96vw)"
            title={t('tasks.fields.description')}
            onCancel={() => setExpanded(false)}
            footer={[
              <Button key="c" onClick={() => setExpanded(false)}>
                {t('common.cancel')}
              </Button>,
              <Button
                key="s"
                type="primary"
                onClick={() => {
                  change(big);
                  if (onCommit) {
                    dirty.current = false;
                    onCommit(big);
                  }
                  setExpanded(false);
                }}
              >
                {t('common.save')}
              </Button>,
            ]}
            className="te-bigeditor"
            destroyOnHidden
          >
            <Editor value={big} format="html" onChange={setBig} placeholder={placeholder} onChecklist={onChecklist} minHeight={420} expanded autoFocus />
          </Modal>,
          document.body
        )}
    </div>
  );
}

export function MentionAvatar({ user }) {
  return <UserAvatar user={user} size={18} tip={false} />;
}
