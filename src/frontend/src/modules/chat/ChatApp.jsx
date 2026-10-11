import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Input, Modal, Segmented, Select, Skeleton, Spin } from 'antd';
import Chrome from '../../components/Chrome';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { errorMessage } from '../../lib/errors';
import { UserAvatar } from '../shared/People';
import { chatApi } from './api';
import { useChat, useChatEvents } from './ChatContext';
import Conversation, { RoomAvatar } from './components/Conversation';
import { systemView } from './system';

function lastText(room, t, locale) {
  const last = room.lastMessage;
  if (!last) return room.kind === 'entity' ? t('chat.noMessagesYet') : '';
  if (last.deleted) return t('chat.deleted');
  if (last.kind === 'system') return systemView(last.data, { t, locale, actor: last.author?.name || t('chat.someone') })?.text || '';
  const text = last.text || (last.files ? `📎 ${t('chat.filesN', { n: last.files })}` : '');
  if (room.kind === 'direct' || !last.author) return text;
  return `${last.author.name.split(' ')[0]}: ${text}`;
}

function when(value, locale) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  if (now - date < 6 * 86400000) return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short' });
  return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' });
}

function NewChat({ open, onClose, allowGroups }) {
  const { t } = useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState('direct');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState(null);
  const [title, setTitle] = useState('');
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('direct');
    setQ('');
    setTitle('');
    setChosen([]);
    chatApi.directory('').then((res) => setPeople(res.data.people)).catch(() => setPeople([]));
  }, [open]);

  const find = (value) => {
    setQ(value);
    chatApi.directory(value).then((res) => setPeople(res.data.people)).catch(() => {});
  };

  const openDirect = async (person) => {
    setBusy(true);
    try {
      const res = await chatApi.direct(person.id);
      onClose();
      navigate(`/app/chat/${res.data.room.id}`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    setBusy(true);
    try {
      const res = await chatApi.createGroup({ title, memberIds: chosen });
      onClose();
      navigate(`/app/chat/${res.data.room.id}`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('chat.newChat')}
      footer={mode === 'group' ? [<Button key="c" onClick={onClose}>{t('common.cancel')}</Button>, <Button key="ok" type="primary" disabled={!title.trim() || busy} loading={busy} onClick={createGroup}>{t('chat.createGroup')}</Button>] : null}
      width={480}
      destroyOnHidden
    >
      {allowGroups && (
        <Segmented
          block
          value={mode}
          onChange={setMode}
          options={[
            { value: 'direct', label: t('chat.kind.direct') },
            { value: 'group', label: t('chat.kind.group') },
          ]}
          style={{ marginBottom: 14 }}
        />
      )}
      {mode === 'direct' ? (
        <>
          <Input.Search autoFocus allowClear placeholder={t('chat.findPeople')} value={q} onChange={(event) => find(event.target.value)} />
          <ul className="cl-people">
            {people === null ? (
              <Skeleton active avatar paragraph={{ rows: 3 }} />
            ) : (
              people.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => openDirect(person)} disabled={busy}>
                    <span className="cr-avatar">
                      <UserAvatar user={person} size={36} tip={false} />
                      {person.online && <i className="cr-online" />}
                    </span>
                    <span>
                      <b>{person.name}</b>
                      <em>{person.online ? t('chat.online') : `@${person.username}`}</em>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      ) : (
        <div className="cl-group">
          <Input autoFocus value={title} maxLength={200} placeholder={t('chat.groupName')} onChange={(event) => setTitle(event.target.value)} />
          <Select
            mode="multiple"
            value={chosen}
            onChange={setChosen}
            showSearch
            filterOption={false}
            onSearch={find}
            placeholder={t('chat.addPeople')}
            options={(people || []).map((person) => ({ value: person.id, label: person.name }))}
            style={{ width: '100%' }}
          />
        </div>
      )}
    </Modal>
  );
}

function RoomList({ rooms, activeId, filter, setFilter, q, setQ, onNew, allowNew }) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const shown = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (rooms || []).filter((room) => {
      if (filter === 'unread' && !room.unread) return false;
      if (['direct', 'group', 'entity'].includes(filter) && room.kind !== filter) return false;
      return !text || `${room.title} ${room.other?.username || ''}`.toLowerCase().includes(text);
    });
  }, [rooms, filter, q]);
  return (
    <aside className="cl">
      <div className="cl__head">
        <h1>{t('apps.chat.name')}</h1>
        {allowNew && (
          <Button type="primary" shape="circle" onClick={onNew} aria-label={t('chat.newChat')}>
            ✎
          </Button>
        )}
      </div>
      <Input.Search className="cl__search" allowClear placeholder={t('chat.searchChats')} value={q} onChange={(event) => setQ(event.target.value)} />
      <div className="cl__filters">
        {['all', 'unread', 'direct', 'group', 'entity'].map((key) => (
          <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
            {t(`chat.filter.${key}`)}
          </button>
        ))}
      </div>
      <div className="cl__list">
        {rooms === null ? (
          <Skeleton active avatar paragraph={{ rows: 6 }} />
        ) : shown.length ? (
          shown.map((room) => (
            <button key={room.id} type="button" className={`cl-room${room.id === activeId ? ' is-active' : ''}${room.unread ? ' is-unread' : ''}`} onClick={() => navigate(`/app/chat/${room.id}`)}>
              <RoomAvatar room={room} size={46} />
              <span className="cl-room__text">
                <span className="cl-room__top">
                  <b>
                    {room.kind === 'entity' && <span className="cl-room__kind">✓ </span>}
                    {room.title}
                  </b>
                  {room.lastMessage && <time>{when(room.lastMessage.at, locale)}</time>}
                </span>
                <span className="cl-room__bottom">
                  <em>{lastText(room, t, locale)}</em>
                  {room.pinned && <i className="cl-room__pin">📌</i>}
                  {room.muted && <i className="cl-room__mute">🔕</i>}
                  {room.mentions > 0 && <span className="cl-room__at">@</span>}
                  {room.unread > 0 && <span className={`cl-room__badge${room.muted ? ' is-muted' : ''}`}>{room.unread > 99 ? '99+' : room.unread}</span>}
                </span>
              </span>
            </button>
          ))
        ) : (
          <div className="cl__empty">{q || filter !== 'all' ? t('chat.nothingFound') : t('chat.noChats')}</div>
        )}
      </div>
    </aside>
  );
}

/** /app/chat/u/:userId — opens (or starts) the direct chat with someone. */
function DirectRoute() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  useEffect(() => {
    chatApi
      .direct(userId)
      .then((res) => navigate(`/app/chat/${res.data.room.id}`, { replace: true }))
      .catch((err) => {
        message.error(errorMessage(err));
        navigate('/app/chat', { replace: true });
      });
  }, [userId, navigate, message]);
  return <div className="cc-loading"><Spin /></div>;
}

function Messenger() {
  const { t } = useLocale();
  const { roomId } = useParams();
  const { user } = useAuth();
  const { refreshUnread } = useChat();
  const [rooms, setRooms] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [config, setConfig] = useState({});
  const active = Number(roomId) || null;

  const load = useCallback(() => chatApi.rooms().then((res) => setRooms(res.data.rooms)).catch(() => setRooms([])), []);
  useEffect(() => {
    load();
    chatApi.home().then((res) => setConfig(res.data.config)).catch(() => {});
  }, [load]);

  // The list follows live events: new messages move a chat up, reads clear badges.
  useChatEvents((type, data) => {
    if (type === 'message') {
      setRooms((prev) => {
        if (!prev) return prev;
        const room = prev.find((item) => item.id === data.roomId);
        if (!room) {
          load();
          return prev;
        }
        const mine = data.message.author?.id === user.id;
        const updated = {
          ...room,
          lastMessage: { id: data.message.id, kind: data.message.kind, text: data.message.body, data: data.message.data, files: data.message.files?.length, author: data.message.author, at: data.message.createdAt },
          updatedAt: data.message.createdAt,
          unread: mine || data.message.kind === 'system' || data.roomId === active ? room.unread : room.unread + 1,
        };
        return [updated, ...prev.filter((item) => item.id !== room.id)].sort((a, b) => Number(b.pinned) - Number(a.pinned));
      });
    }
    if (type === 'read' && data.userId === user.id) setRooms((prev) => prev && prev.map((room) => (room.id === data.roomId ? { ...room, unread: 0, mentions: 0 } : room)));
    if (type === 'room') load();
  });

  useEffect(() => {
    if (active) setRooms((prev) => prev && prev.map((room) => (room.id === active ? { ...room, unread: 0, mentions: 0 } : room)));
  }, [active]);

  return (
    <div className={`chat-app${active ? ' has-room' : ''}`}>
      <RoomList rooms={rooms} activeId={active} filter={filter} setFilter={setFilter} q={q} setQ={setQ} onNew={() => setCreating(true)} allowNew />
      <section className="chat-app__room">
        {active ? (
          <>
            <button type="button" className="chat-app__back" onClick={() => window.history.back()}>
              ← {t('apps.chat.name')}
            </button>
            <Conversation key={active} roomId={active} onRoomLoaded={() => { load(); refreshUnread(); }} />
          </>
        ) : (
          <div className="chat-app__empty">
            <div className="chat-app__art" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <h2>{t('chat.welcomeTitle')}</h2>
            <p>{t('chat.welcomeText')}</p>
            <Button type="primary" size="large" onClick={() => setCreating(true)}>
              ✎ {t('chat.newChat')}
            </Button>
          </div>
        )}
      </section>
      <NewChat open={creating} onClose={() => setCreating(false)} allowGroups={config.allowGroups !== false} />
    </div>
  );
}

/** Chat app: /app/chat, /app/chat/:roomId, /app/chat/u/:userId. */
export default function ChatApp() {
  return (
    <div className="shell">
      <Chrome dense />
      <Routes>
        <Route index element={<Messenger />} />
        <Route path="u/:userId" element={<DirectRoute />} />
        <Route path=":roomId" element={<Messenger />} />
        <Route path="*" element={<Navigate to="/app/chat" replace />} />
      </Routes>
    </div>
  );
}
