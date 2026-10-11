import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Popover, Tooltip } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { UserAvatar } from '../../shared/People';
import { formatSize } from '../api';
import MessageText, { isEmojiOnly } from '../text';
import { systemView } from '../system';

const QUICK = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];

/** Quote text without formatting marks. */
const plain = (text) => String(text || '').replace(/```/g, '').replace(/(\*\*|~~|`)/g, '').replace(/\n+/g, ' ');

function time(value, locale) {
  return new Date(value).toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

function FileCard({ file }) {
  const ext = (file.name.split('.').pop() || '').slice(0, 4).toUpperCase();
  return (
    <a className="cm-file" href={`${file.url}?download=1`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
      <span className="cm-file__ext">{ext || 'FILE'}</span>
      <span className="cm-file__text">
        <b>{file.name}</b>
        <em>{formatSize(file.size)}</em>
      </span>
      <span className="cm-file__dl">⤓</span>
    </a>
  );
}

function SystemLine({ message }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const actor = message.author?.name || t('chat.someone');
  const view = systemView(message.data, { t, locale, actor, navigate, message });
  return (
    <div className={`cm-system${view?.tone ? ` is-${view.tone}` : ''}`}>
      <span className="cm-system__pill">
        {view?.icon && <span className="cm-system__icon">{view.icon}</span>}
        <span>{view?.text || t('chat.sys.unknown')}</span>
        <time>{time(message.createdAt, locale)}</time>
      </span>
      {view?.actions?.length > 0 && (
        <span className="cm-system__actions">
          {view.actions.map((action) => (
            <button key={action.key} type="button" onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * One message: bubble (own on the right), author and time, reply quote,
 * pictures and files, reactions and a hover toolbar (react, reply, more).
 */
function MessageItem({ message, me, first, last, showAuthor, read, mentions, onReply, onEdit, onDelete, onReact, onJump, onImages, extraActions, canWrite }) {
  const { t, locale } = useLocale();
  if (message.kind === 'system') return <SystemLine message={message} />;
  const mine = message.author?.id === me?.id;
  const images = message.files.filter((file) => file.image);
  const others = message.files.filter((file) => !file.image);
  const emojiOnly = !message.deleted && !images.length && !others.length && !message.replyTo && isEmojiOnly(message.body);
  const call = message.data?.call;

  const more = [
    canWrite && { key: 'reply', label: `↩ ${t('chat.reply')}`, onClick: () => onReply(message) },
    message.body && { key: 'copy', label: `⧉ ${t('chat.copy')}`, onClick: () => navigator.clipboard?.writeText(message.body) },
    ...(extraActions ? extraActions(message) : []),
    mine && !message.deleted && !call && { key: 'edit', label: `✎ ${t('common.edit')}`, onClick: () => onEdit(message) },
    (mine || message.canDelete) && !message.deleted && { type: 'divider' },
    (mine || message.canDelete) && !message.deleted && { key: 'delete', danger: true, label: `✕ ${t('common.delete')}`, onClick: () => onDelete(message) },
  ].filter(Boolean);

  return (
    // tabIndex: a tap focuses the message on touch screens and shows its tools.
    <div className={`cm${mine ? ' is-mine' : ''}${first ? ' is-first' : ''}${last ? ' is-last' : ''}${emojiOnly ? ' is-emoji' : ''}`} data-id={message.id} tabIndex={-1}>
      <div className="cm__avatar">{!mine && last && <UserAvatar user={message.author} size={32} tip={false} />}</div>
      <div className="cm__main">
        {showAuthor && first && !mine && <div className="cm__author">{message.author?.name}</div>}
        <div className="cm__bubble">
          {message.deleted ? (
            <span className="cm__deleted">{t('chat.deleted')}</span>
          ) : (
            <>
              {message.replyTo && (
                <button type="button" className="cm-quote" onClick={() => onJump(message.replyTo.id)}>
                  <b>{message.replyTo.author}</b>
                  <span>{message.replyTo.deleted ? t('chat.deleted') : plain(message.replyTo.text) || (message.replyTo.files ? `📎 ${message.replyTo.files}` : '')}</span>
                </button>
              )}
              {images.length > 0 && (
                <div className={`cm-images is-${Math.min(images.length, 4)}`}>
                  {images.slice(0, 4).map((file, index) => (
                    <button key={file.id} type="button" onClick={() => onImages(images, index)}>
                      <img src={file.url} alt={file.name} loading="lazy" />
                      {index === 3 && images.length > 4 && <span>+{images.length - 4}</span>}
                    </button>
                  ))}
                </div>
              )}
              {others.map((file) => (
                <FileCard key={file.id} file={file} />
              ))}
              {call ? (
                <a className="cm-call" href={call.url} target="_blank" rel="noopener noreferrer">
                  <span className="cm-call__icon">📹</span>
                  <span>
                    <b>{t('chat.call.title')}</b>
                    <em>{t('chat.call.join')}</em>
                  </span>
                </a>
              ) : (
                message.body && <MessageText text={message.body} mentions={mentions} me={me?.username} />
              )}
            </>
          )}
          <span className="cm__meta">
            {message.editedAt && !message.deleted && <em>{t('chat.edited')}</em>}
            <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB')}>
              {time(message.createdAt, locale)}
            </time>
            {mine && !message.deleted && <span className={`cm__ticks${read ? ' is-read' : ''}`}>{read ? '✓✓' : '✓'}</span>}
          </span>
        </div>
        {message.reactions.length > 0 && (
          <div className="cm-reactions">
            {message.reactions.map((reaction) => (
              <Tooltip key={reaction.emoji} title={reaction.users.join(', ')}>
                <button type="button" className={reaction.userIds?.includes(me?.id) ? 'is-mine' : ''} onClick={() => onReact(message, reaction.emoji)}>
                  {reaction.emoji} <b>{reaction.count}</b>
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
      {!message.deleted && (
        <div className="cm__tools">
          {canWrite && (
            <Popover
              trigger="click"
              placement="top"
              content={
                <div className="cm-quick">
                  {QUICK.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => onReact(message, emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              }
            >
              <button type="button" aria-label={t('chat.react')}>☺</button>
            </Popover>
          )}
          {canWrite && (
            <button type="button" onClick={() => onReply(message)} aria-label={t('chat.reply')}>
              ↩
            </button>
          )}
          <Dropdown trigger={['click']} menu={{ items: more }} placement="bottomRight">
            <button type="button" aria-label={t('chat.more')}>⋯</button>
          </Dropdown>
        </div>
      )}
    </div>
  );
}

export default memo(MessageItem);
