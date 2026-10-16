import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Skeleton } from 'antd';
import { useLocale } from '../../../context/LocaleContext';
import { chatApi } from '../api';
import { useChat } from '../ChatContext';
import { RoomAvatar } from './Conversation';

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17h0A1.5 1.5 0 0 1 4 15.5v-9Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
}

/** Header button: unread chat messages and the latest conversations. */
export default function ChatButton() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { enabled, unread } = useChat();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState(null);
  useEffect(() => {
    if (open) chatApi.rooms().then((res) => setRooms(res.data.rooms.slice(0, 8))).catch(() => setRooms([]));
  }, [open]);
  if (!enabled) return null;
  const go = (path) => {
    setOpen(false);
    navigate(path);
  };
  const panel = (
    <div className="bell__panel chat-pop">
      <div className="bell__head">
        <strong>{t('apps.chat.name')}</strong>
      </div>
      <div className="bell__list">
        {rooms === null ? (
          <div style={{ padding: 16 }}>
            <Skeleton active avatar paragraph={{ rows: 3 }} />
          </div>
        ) : rooms.length ? (
          rooms.map((room) => (
            <button key={room.id} type="button" className={`chat-pop__room${room.unread ? ' is-unread' : ''}`} onClick={() => go(`/app/chat/${room.id}`)}>
              <RoomAvatar room={room} size={34} />
              <span>
                <b>{room.title}</b>
                <em>{room.lastMessage?.text || ''}</em>
              </span>
              {room.unread > 0 && <i>{room.unread}</i>}
            </button>
          ))
        ) : (
          <div className="bell__empty">{t('chat.noChats')}</div>
        )}
      </div>
      <div className="bell__foot">
        <button type="button" onClick={() => go('/app/chat')}>{t('chat.openAll')}</button>
      </div>
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
