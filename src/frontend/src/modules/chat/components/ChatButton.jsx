import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { chatApi } from '../api';
import { useChat } from '../ChatContext';
import { lastText, when } from '../preview';
import { RoomAvatar } from './Conversation';

function ChatIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17h0A1.5 1.5 0 0 1 4 15.5v-9Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Header button: unread chat messages and the latest conversations. */
export default function ChatButton() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { enabled, unread } = useChat();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    if (open) chatApi.rooms().then((res) => setRooms(res.data.rooms)).catch(() => setRooms([]));
  }, [open]);
  if (!enabled) return null;
  const go = (path) => {
    setOpen(false);
    navigate(path);
  };
  const shown = rooms && (filter === 'unread' ? rooms.filter((room) => room.unread > 0) : rooms).slice(0, 8);
  const panel = (
    <div className="bell__panel chat-pop">
      <div className="chat-pop__head">
        <div className="chat-pop__title">
          <strong>{t('apps.chat.name')}</strong>
          {unread > 0 && <span className="chat-pop__total">{unread > 99 ? '99+' : unread}</span>}
        </div>
        <div className="bell__filters">
          {['all', 'unread'].map((key) => (
            <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
              {t(`chat.filter.${key}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="chat-pop__list">
        {shown === null ? (
          <div className="chat-pop__loading">
            <Skeleton active avatar paragraph={{ rows: 2 }} />
          </div>
        ) : shown.length ? (
          shown.map((room) => (
            <button key={room.id} type="button" className={`chat-pop__room${room.unread ? ' is-unread' : ''}${room.muted ? ' is-muted' : ''}`} onClick={() => go(`/app/chat/${room.id}`)}>
              <span className="chat-pop__avatar">
                <RoomAvatar room={room} size={40} shape={room.kind === 'direct' ? undefined : 'square'} />
              </span>
              <span className="chat-pop__text">
                <span className="chat-pop__top">
                  <b>{room.title}</b>
                  {room.lastMessage && <time>{when(room.lastMessage.at, locale)}</time>}
                </span>
                <span className="chat-pop__bottom">
                  <em>{lastText(room, t, locale) || ' '}</em>
                  {room.mentions > 0 && <span className="chat-pop__at">@</span>}
                  {room.unread > 0 && <span className="chat-pop__badge">{room.unread > 99 ? '99+' : room.unread}</span>}
                </span>
              </span>
            </button>
          ))
        ) : (
          <div className="chat-pop__empty">
            <span className="chat-pop__empty-icon">
              <ChatIcon size={22} />
            </span>
            {filter === 'unread' ? t('chat.allRead') : t('chat.noChats')}
          </div>
        )}
      </div>
      <button type="button" className="chat-pop__all" onClick={() => go('/app/chat')}>
        <span>{t('chat.openAll')}</span>
        <Arrow />
      </button>
    </div>
  );
  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} placement="bottomRight" popupRender={() => panel} overlayClassName="bell">
      <button type="button" className="chrome__icon bell__button" aria-label={t('apps.chat.name')} data-tour="header.chat">
        <ChatIcon />
        {unread > 0 && <span className="bell__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    </Dropdown>
  );
}
