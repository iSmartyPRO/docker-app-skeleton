import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { App, Popover, Progress, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { UserAvatar } from '../../shared/People';
import { chatApi, formatSize } from '../api';

export const EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅', '🎉', '👀', '💯', '🤝', '😊', '😉', '🤔', '😅', '👏', '🙌', '💪', '🚀', '⚡', '⭐', '📌', '📎', '✍️', '📅', '⏰', '☕', '🍕', '🎯', '❗', '❓', '👌', '🤗', '😎', '🥳', '😴', '🤦', '🙈', '💡'];

function Icon({ d, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  attach: 'M21 11.5 12.6 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14.5s1.2 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01',
  send: 'M5 12h13M12 5l7 7-7 7',
};

/** The @word right before the caret, if any. */
function mentionAt(text, caret) {
  const before = text.slice(0, caret);
  const match = /(^|[\s(])@([\w.-]{0,32})$/.exec(before);
  return match ? { query: match[2].toLowerCase(), start: caret - match[2].length - 1 } : null;
}

/**
 * Message input: grows with the text, Enter sends (Shift+Enter — new line),
 * @ suggests people of the chat, files by button, paste or drop (uploaded at
 * once, sent with the message), emoji, reply and edit modes.
 */
const Composer = forwardRef(function Composer({ room, members, replyTo, editing, onCancelReply, onCancelEdit, onSent, onEdited, disabled, placeholder, maxUploadMb = 100 }, ref) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [uploads, setUploads] = useState([]);
  const [mention, setMention] = useState(null);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const area = useRef(null);
  const fileInput = useRef(null);
  const typingAt = useRef(0);

  // Editing a sent message borrows the input: the unsent draft (text and uploaded
  // files) is put aside and comes back once the edit is saved or cancelled.
  const stash = useRef(null);
  useEffect(() => {
    if (editing) {
      if (!stash.current) {
        stash.current = { roomId: room?.id, text, uploads };
        setUploads([]);
      }
      setText(editing.body);
      requestAnimationFrame(() => area.current?.focus());
    } else if (stash.current) {
      const saved = stash.current;
      stash.current = null;
      if (saved.roomId === room?.id) {
        setText(saved.text);
        setUploads((prev) => [...saved.uploads, ...prev]);
      } else {
        saved.uploads.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  const resize = () => {
    const node = area.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  };
  useEffect(resize, [text]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    return (members || [])
      .filter((person) => person.username && `${person.name} ${person.username}`.toLowerCase().includes(mention.query))
      .slice(0, 6);
  }, [mention, members]);

  const upload = useCallback(
    async (files) => {
      const list = [...files].filter((file) => file.size > 0);
      if (!list.length || !room) return;
      const tooBig = list.find((file) => file.size > maxUploadMb * 1024 * 1024);
      if (tooBig) {
        message.error(t('chat.tooLarge', { name: tooBig.name, mb: maxUploadMb }));
        return;
      }
      const batch = list.map((file, index) => ({
        key: `${Date.now()}-${index}`,
        name: file.name,
        size: file.size,
        preview: /^image\//.test(file.type) ? URL.createObjectURL(file) : null,
        progress: 0,
        file: null,
      }));
      setUploads((prev) => [...prev, ...batch]);
      try {
        const res = await chatApi.upload(room.id, list, (progress) => setUploads((prev) => prev.map((item) => (batch.some((b) => b.key === item.key) ? { ...item, progress } : item))));
        setUploads((prev) => prev.map((item) => {
          const index = batch.findIndex((b) => b.key === item.key);
          return index >= 0 ? { ...item, progress: 1, file: res.data.files[index] } : item;
        }));
      } catch (err) {
        message.error(errorMessage(err));
        setUploads((prev) => prev.filter((item) => !batch.some((b) => b.key === item.key)));
      }
      area.current?.focus();
    },
    [room, maxUploadMb, message, t]
  );

  useImperativeHandle(ref, () => ({ upload, focus: () => area.current?.focus(), insert: (value) => setText((prev) => `${prev}${value}`) }), [upload]);

  const pick = (person) => {
    const caret = area.current.selectionStart;
    const next = `${text.slice(0, mention.start)}@${person.username} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + person.username.length + 2;
      area.current.setSelectionRange(pos, pos);
      area.current.focus();
    });
  };

  const busy = uploads.some((item) => !item.file);
  const ready = (text.trim() || uploads.length) && !busy && !sending;

  const submit = async () => {
    if (!ready || !room) return;
    setSending(true);
    try {
      if (editing) {
        const res = await chatApi.edit(editing.id, text);
        onEdited?.(res.data.message);
        setText('');
      } else {
        const res = await chatApi.send(room.id, { body: text, replyTo: replyTo?.id, fileIds: uploads.map((item) => item.file.id) });
        onSent?.(res.data.message);
        setText('');
        uploads.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
        setUploads([]);
      }
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSending(false);
      requestAnimationFrame(() => area.current?.focus());
    }
  };

  const onKeyDown = (event) => {
    if (mention && candidates.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((value) => (value + 1) % candidates.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((value) => (value - 1 + candidates.length) % candidates.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(candidates[active]);
        return;
      }
      if (event.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (event.key === 'Escape' && (editing || replyTo)) {
      event.preventDefault();
      if (editing) {
        setText('');
        onCancelEdit?.();
      } else onCancelReply?.();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onChange = (event) => {
    const value = event.target.value;
    setText(value);
    const found = mentionAt(value, event.target.selectionStart);
    setMention(found);
    setActive(0);
    // "…is typing" at most every 3 seconds.
    if (room && value && Date.now() - typingAt.current > 3000) {
      typingAt.current = Date.now();
      chatApi.typing(room.id).catch(() => {});
    }
  };

  if (disabled) return <div className="cc-composer is-disabled">{t('chat.readOnly')}</div>;

  return (
    <div className="cc-composer">
      {(replyTo || editing) && (
        <div className="cc-composer__context">
          <span className="cc-composer__context-bar" />
          <span className="cc-composer__context-text">
            <b>{editing ? t('chat.editing') : t('chat.replyTo', { name: replyTo.author?.name || '' })}</b>
            <em>{(editing || replyTo).body || (replyTo?.files?.length ? `📎 ${replyTo.files.length}` : '')}</em>
          </span>
          <button
            type="button"
            onClick={() => {
              if (editing) {
                setText('');
                onCancelEdit?.();
              } else onCancelReply?.();
            }}
            aria-label={t('common.cancel')}
          >
            ✕
          </button>
        </div>
      )}
      {uploads.length > 0 && (
        <div className="cc-uploads">
          {uploads.map((item) => (
            <div key={item.key} className="cc-upload">
              {item.preview ? <img src={item.preview} alt="" /> : <span className="cc-upload__ext">{(item.name.split('.').pop() || '').slice(0, 4).toUpperCase()}</span>}
              <span className="cc-upload__name">
                <b>{item.name}</b>
                <em>{item.file ? formatSize(item.size) : <Progress percent={Math.round(item.progress * 100)} size="small" showInfo={false} />}</em>
              </span>
              <button type="button" onClick={() => setUploads((prev) => prev.filter((entry) => entry.key !== item.key))} aria-label={t('common.delete')}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {mention && candidates.length > 0 && (
        <ul className="cc-mentions" role="listbox">
          {candidates.map((person, index) => (
            <li key={person.id}>
              <button type="button" className={index === active ? 'is-active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(person)}>
                <UserAvatar user={person} size={24} tip={false} />
                <span>{person.name}</span>
                <em>@{person.username}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cc-composer__row">
        {!editing && (
          <Tooltip title={t('chat.attach')}>
            <button type="button" className="cc-tool" onClick={() => fileInput.current?.click()} aria-label={t('chat.attach')}>
              <Icon d={ICONS.attach} />
            </button>
          </Tooltip>
        )}
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={placeholder || t('chat.placeholder')}
          title={t('chat.enterHint')}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMention(null), 150)}
          onPaste={(event) => {
            const files = [...(event.clipboardData?.files || [])];
            if (files.length) {
              event.preventDefault();
              upload(files);
            }
          }}
          maxLength={10000}
        />
        <Popover
          open={emojiOpen}
          onOpenChange={setEmojiOpen}
          trigger="click"
          placement="topRight"
          content={
            <div className="cc-emoji">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    const node = area.current;
                    const pos = node?.selectionStart ?? text.length;
                    setText(`${text.slice(0, pos)}${emoji}${text.slice(pos)}`);
                    setEmojiOpen(false);
                    requestAnimationFrame(() => node?.focus());
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          }
        >
          <button type="button" className="cc-tool" aria-label={t('chat.emoji')}>
            <Icon d={ICONS.smile} />
          </button>
        </Popover>
        <button type="button" className={`cc-send${ready ? ' is-ready' : ''}`} onClick={submit} disabled={!ready} aria-label={t('chat.send')}>
          {editing ? '✓' : <Icon d={ICONS.send} />}
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          upload(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
});

export default Composer;
