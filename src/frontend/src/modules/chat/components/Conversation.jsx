import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Avatar, Button, Dropdown, Input, Modal, Select, Skeleton, Tooltip } from 'antd';
import { useAuth } from '../../../context/AuthContext';
import { useLocale } from '../../../context/LocaleContext';
import { errorMessage } from '../../../lib/errors';
import { initials } from '../../../lib/format';
import ImageViewer from '../../kb/viewers/ImageViewer';
import { UserAvatar } from '../../shared/People';
import { Hint, HintLabel } from '../../../help/Hint';
import { chatApi, formatSize } from '../api';
import { useChat, useChatEvents } from '../ChatContext';
import Composer from './Composer';
import MessageItem from './MessageItem';
import { fmtDate, inZone, intlOptions, nowInZone, useRegional } from '../../../lib/datetime';
import '../chat.css';

const GROUP_GAP = 5 * 60 * 1000;

function dayLabel(value, t, locale) {
  // Days in the person's zone.
  const date = inZone(value);
  const today = nowInZone().startOf('day');
  const diff = date.startOf('day').diff(today, 'day');
  if (diff === 0) return t('chat.today');
  if (diff === -1) return t('chat.yesterday');
  return new Date(value).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', intlOptions({ day: 'numeric', month: 'long', ...(date.year() !== today.year() ? { year: 'numeric' } : {}) }));
}

/** The person's calendar day of a moment ('YYYY-MM-DD'), for grouping messages. */
function dayKey(value) {
  return inZone(value)?.format('YYYY-MM-DD') || '';
}

function Glyph({ d, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const G = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  video: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h9a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 14 18H5a1.5 1.5 0 0 1-1.5-1.5v-9ZM15.5 10.5 20.5 7v10l-5-3.5',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.3 3.2-5.3 6.5-5.3s5.9 2 6.5 5.3M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.9c1.6.8 2.7 2.5 3 5.1',
  files: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
  down: 'M12 5v14M5 12l7 7 7-7',
};

export function RoomAvatar({ room, size = 40 }) {
  if (room.kind === 'direct' && room.other) {
    return (
      <span className="cr-avatar" style={{ width: size, height: size }}>
        <UserAvatar user={room.other} size={size} tip={false} />
        {room.other.online && <i className="cr-online" />}
      </span>
    );
  }
  const color = room.entityInfo?.color || room.color || (room.kind === 'entity' ? '#10B981' : '#6366F1');
  return (
    <Avatar size={size} style={{ background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 65%, #000))`, flexShrink: 0, fontWeight: 650, fontSize: size * 0.38 }}>
      {room.kind === 'entity' ? '✓' : initials(room.title)}
    </Avatar>
  );
}

function SidePanel({ room, tab, setTab, members, reloadMembers, onJump, onClose }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const [files, setFiles] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [adding, setAdding] = useState(false);
  const [people, setPeople] = useState([]);
  const [chosen, setChosen] = useState([]);

  useEffect(() => {
    if (tab === 'files') chatApi.files(room.id).then((res) => setFiles(res.data.files)).catch(() => setFiles([]));
  }, [tab, room.id]);

  const search = async (value) => {
    setQ(value);
    if (value.trim().length < 2) {
      setFound(null);
      return;
    }
    const res = await chatApi.messages(room.id, { q: value });
    setFound(res.data.messages);
  };

  return (
    <aside className="cc-side">
      <div className="cc-side__tabs">
        {['members', 'files', 'search'].map((key) => (
          <button key={key} type="button" className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
            {t(`chat.side.${key}`)}
          </button>
        ))}
        <button type="button" className="cc-side__close" onClick={onClose} aria-label={t('common.close')}>
          ✕
        </button>
      </div>
      <div className="cc-side__body">
        {tab === 'members' && (
          <>
            {room.can?.manage && (
              <Button block onClick={() => { setAdding(true); chatApi.directory('').then((res) => setPeople(res.data.people)); }} style={{ marginBottom: 10 }}>
                ＋ {t('chat.addMembers')}
              </Button>
            )}
            <ul className="cc-people">
              {(members || []).map((person) => (
                <li key={person.id}>
                  <span className="cr-avatar">
                    <UserAvatar user={person} size={32} tip={false} />
                    {person.online && <i className="cr-online" />}
                  </span>
                  <span className="cc-people__text">
                    <b>{person.name}</b>
                    <em>{person.online ? t('chat.online') : `@${person.username}`}{person.role === 'owner' ? ` · ${t('chat.owner')}` : ''}</em>
                  </span>
                  {person.id !== user.id && (
                    <Tooltip title={t('chat.writeDirect')}>
                      <Link to={`/app/chat/u/${person.id}`} className="cc-people__dm">✉</Link>
                    </Tooltip>
                  )}
                  {room.can?.manage && person.id !== user.id && (
                    <button
                      type="button"
                      className="cc-people__remove"
                      onClick={() =>
                        modal.confirm({
                          title: t('chat.removeConfirm', { name: person.name }),
                          okText: t('chat.remove'),
                          okButtonProps: { danger: true },
                          cancelText: t('common.cancel'),
                          onOk: () => chatApi.removeMember(room.id, person.id).then(reloadMembers).catch((err) => message.error(errorMessage(err))),
                        })
                      }
                      aria-label={t('chat.remove')}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Modal
              open={adding}
              title={<HintLabel id="chat.addMembers">{t('chat.addMembers')}</HintLabel>}
              onCancel={() => setAdding(false)}
              okText={t('chat.add')}
              cancelText={t('common.cancel')}
              okButtonProps={{ disabled: !chosen.length }}
              onOk={async () => {
                await chatApi.addMembers(room.id, chosen).catch((err) => message.error(errorMessage(err)));
                setAdding(false);
                setChosen([]);
                reloadMembers();
              }}
              destroyOnHidden
            >
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                value={chosen}
                onChange={setChosen}
                showSearch
                filterOption={false}
                onSearch={(value) => chatApi.directory(value).then((res) => setPeople(res.data.people))}
                options={people.filter((person) => !(members || []).some((member) => member.id === person.id)).map((person) => ({ value: person.id, label: person.name }))}
                placeholder={t('chat.findPeople')}
              />
            </Modal>
          </>
        )}
        {tab === 'files' &&
          (files === null ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : files.length ? (
            <ul className="cc-files">
              {files.map((file) => (
                <li key={file.id}>
                  {file.image ? <img src={file.url} alt="" loading="lazy" /> : <span className="cm-file__ext">{(file.name.split('.').pop() || '').slice(0, 4).toUpperCase()}</span>}
                  <a href={`${file.url}?download=1`} target="_blank" rel="noopener noreferrer">
                    <b>{file.name}</b>
                    <em>
                      {formatSize(file.size)} · {file.author} · {fmtDate(file.createdAt)}
                    </em>
                  </a>
                  <button type="button" onClick={() => onJump(file.messageId)} title={t('chat.showInChat')}>
                    ↗
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="cc-empty-small">{t('chat.noFiles')}</div>
          ))}
        {tab === 'search' && (
          <>
            <Input.Search autoFocus allowClear placeholder={t('chat.searchIn')} value={q} onChange={(event) => search(event.target.value)} />
            <ul className="cc-found">
              {(found || []).map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onJump(item.id)}>
                    <b>{item.author?.name}</b>
                    <span>{item.body}</span>
                    <em>{new Date(item.createdAt).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-GB', intlOptions({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</em>
                  </button>
                </li>
              ))}
              {found && !found.length && <div className="cc-empty-small">{t('chat.nothingFound')}</div>}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * A conversation: header, messages, composer, side panel (people, files,
 * search). Opens a room by id or a record's conversation by `entity`
 * ({ type, id }). Live through the shared ChatProvider.
 */
export default function Conversation({ roomId, entity, header = true, bareTitle, placeholder, emptyHint, extraActions, onRoomLoaded, compact = false }) {
  const { t, locale } = useLocale();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const { setFocus, refreshUnread } = useChat();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [members, setMembers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [typing, setTyping] = useState({});
  const [side, setSide] = useState(null);
  const [below, setBelow] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [unreadFrom, setUnreadFrom] = useState(null);
  const [config, setConfig] = useState({});
  const list = useRef(null);
  const composer = useRef(null);
  const loadingOlder = useRef(false);
  const readTimer = useRef(null);
  const lastRead = useRef(0);
  const highlight = useRef(null);

  // Room
  useEffect(() => {
    let alive = true;
    setRoom(null);
    setMessages(null);
    setError(null);
    setReplyTo(null);
    setEditing(null);
    setSide(null);
    const load = entity ? chatApi.entity(entity.type, entity.id) : chatApi.room(roomId);
    load
      .then((res) => {
        if (!alive) return;
        setRoom(res.data.room);
        setUnreadFrom(res.data.room.unread ? res.data.room.lastReadId : null);
        lastRead.current = res.data.room.lastReadId;
        onRoomLoaded?.(res.data.room);
      })
      .catch((err) => alive && setError(err));
    chatApi.home().then((res) => alive && setConfig(res.data.config)).catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, entity?.type, entity?.id]);

  // Keyed by the room id: room updates (rename, settings) must not refetch and drop
  // the loaded history or a jump into the past.
  const currentRoomId = room?.id;
  const reloadMembers = useCallback(() => {
    if (currentRoomId) chatApi.members(currentRoomId).then((res) => setMembers(res.data.members)).catch(() => {});
  }, [currentRoomId]);

  useEffect(() => {
    if (!currentRoomId) return undefined;
    let alive = true;
    setFocus(currentRoomId);
    reloadMembers();
    chatApi
      .messages(currentRoomId)
      .then((res) => {
        if (!alive) return;
        setMessages(res.data.messages);
        setHasOlder(Boolean(res.data.hasOlder));
        setHasNewer(false);
      })
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
      setFocus(null);
    };
  }, [currentRoomId, setFocus, reloadMembers]);

  // Scrolling
  const scrollToBottom = (smooth) => {
    const node = list.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  const firstPaint = useRef(true);
  useLayoutEffect(() => {
    if (!messages || !firstPaint.current) return;
    firstPaint.current = false;
    const marker = list.current?.querySelector('.cc-unread');
    if (marker) marker.scrollIntoView({ block: 'center' });
    else scrollToBottom(false);
  }, [messages]);
  useEffect(() => {
    firstPaint.current = true;
  }, [room?.id]);

  const markRead = useCallback(() => {
    if (!room || !messages?.length || document.visibilityState !== 'visible') return;
    const last = messages[messages.length - 1].id;
    if (last <= lastRead.current) return;
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      lastRead.current = last;
      chatApi.read(room.id, last).then(() => refreshUnread()).catch(() => {});
    }, 500);
  }, [room, messages, refreshUnread]);

  useEffect(() => {
    if (atBottom && !hasNewer) markRead();
  }, [atBottom, messages, hasNewer, markRead]);
  useEffect(() => {
    const onVisible = () => atBottom && markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [atBottom, markRead]);

  const loadOlder = async () => {
    if (!hasOlder || loadingOlder.current || !messages?.length) return;
    loadingOlder.current = true;
    const node = list.current;
    const before = node.scrollHeight;
    try {
      const res = await chatApi.messages(room.id, { before: messages[0].id });
      setMessages((prev) => [...res.data.messages.filter((item) => !prev.some((p) => p.id === item.id)), ...prev]);
      setHasOlder(Boolean(res.data.hasOlder));
      requestAnimationFrame(() => {
        node.scrollTop += node.scrollHeight - before;
      });
    } finally {
      loadingOlder.current = false;
    }
  };

  const onScroll = () => {
    const node = list.current;
    if (!node) return;
    if (node.scrollTop < 120) loadOlder();
    const bottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setBelow(0);
  };

  /** Shows a message, loading the part of the history around it if needed. */
  const jump = useCallback(
    async (id) => {
      const flash = () => {
        const node = list.current?.querySelector(`[data-id="${id}"]`);
        if (!node) return false;
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        node.classList.add('is-flash');
        clearTimeout(highlight.current);
        highlight.current = setTimeout(() => node.classList.remove('is-flash'), 1600);
        return true;
      };
      if (flash()) return;
      const res = await chatApi.messages(room.id, { around: id });
      setMessages(res.data.messages);
      setHasOlder(Boolean(res.data.hasOlder));
      setHasNewer(Boolean(res.data.hasNewer));
      requestAnimationFrame(() => requestAnimationFrame(flash));
    },
    [room]
  );

  const backToLatest = async () => {
    if (hasNewer) {
      const res = await chatApi.messages(room.id);
      setMessages(res.data.messages);
      setHasOlder(Boolean(res.data.hasOlder));
      setHasNewer(false);
      requestAnimationFrame(() => scrollToBottom(false));
    } else scrollToBottom(true);
    setBelow(0);
  };

  // Live events
  const withMine = useCallback((item) => ({ ...item, mine: item.author?.id === user.id }), [user.id]);
  const shownRoom = useRef(null);
  shownRoom.current = room?.id ?? null;
  useChatEvents((type, data) => {
    // (Re)connected: events sent while the stream was down are lost, so load
    // what came after the last message on screen. Otherwise a later message
    // would mark the missed ones as read without anyone seeing them.
    if (type === 'hello') {
      if (!room || !messages?.length || hasNewer) return;
      const roomId = room.id;
      const lastId = messages[messages.length - 1].id;
      chatApi
        .messages(roomId, { after: lastId })
        .then((res) => {
          if (shownRoom.current !== roomId) return;
          const fresh = (res.data.messages || []).map(withMine);
          if (res.data.hasNewer) setHasNewer(true);
          if (!fresh.length) return;
          setMessages((prev) => {
            if (!prev) return prev;
            const known = new Set(prev.map((item) => item.id));
            return [...prev, ...fresh.filter((item) => !known.has(item.id))].sort((x, y) => x.id - y.id);
          });
          const node = list.current;
          const stick = node && node.scrollHeight - node.scrollTop - node.clientHeight < 120;
          if (stick) requestAnimationFrame(() => scrollToBottom(true));
          else setBelow((n) => n + fresh.filter((item) => !item.mine).length);
        })
        .catch(() => {});
      return;
    }
    if (!room || data.roomId !== room.id) return;
    if (type === 'message') {
      if (hasNewer) {
        setBelow((n) => n + 1);
        return;
      }
      const node = list.current;
      const stick = node && node.scrollHeight - node.scrollTop - node.clientHeight < 120;
      setMessages((prev) => (prev && !prev.some((item) => item.id === data.message.id) ? [...prev, withMine(data.message)] : prev));
      setTyping((prev) => {
        const next = { ...prev };
        if (data.message.author) delete next[data.message.author.id];
        return next;
      });
      if (stick || data.message.author?.id === user.id) requestAnimationFrame(() => scrollToBottom(true));
      else if (data.message.author?.id !== user.id) setBelow((n) => n + 1);
    }
    if (type === 'message.update') setMessages((prev) => prev && prev.map((item) => (item.id === data.message.id ? withMine(data.message) : item)));
    if (type === 'message.delete') setMessages((prev) => prev && prev.map((item) => (item.id === data.id ? { ...item, deleted: true, body: '', files: [], reactions: [] } : item)));
    if (type === 'read') setMembers((prev) => prev.map((person) => (person.id === data.userId ? { ...person, lastReadId: data.lastReadId } : person)));
    if (type === 'typing' && data.user?.id !== user.id) {
      setTyping((prev) => ({ ...prev, [data.user.id]: { name: data.user.name, at: Date.now() } }));
      setTimeout(() => setTyping((prev) => {
        const next = { ...prev };
        if (next[data.user.id] && Date.now() - next[data.user.id].at >= 4500) delete next[data.user.id];
        return next;
      }), 5000);
    }
    if (type === 'room') {
      if (data.removed) setError({ message: t('chat.removedFromChat') });
      else chatApi.room(room.id).then((res) => setRoom((prev) => ({ ...prev, ...res.data.room }))).catch(() => {});
      reloadMembers();
    }
  });

  const sent = (item) => {
    setReplyTo(null);
    setMessages((prev) => (prev && !prev.some((entry) => entry.id === item.id) ? [...prev, withMine(item)] : prev));
    setUnreadFrom(null);
    requestAnimationFrame(() => scrollToBottom(true));
  };

  const react = async (item, emoji) => {
    try {
      const res = await chatApi.react(item.id, emoji);
      setMessages((prev) => prev.map((entry) => (entry.id === item.id ? withMine(res.data.message) : entry)));
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = (item) =>
    modal.confirm({
      title: t('chat.deleteConfirm'),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => chatApi.remove(item.id).catch((err) => message.error(errorMessage(err))),
    });

  const startCall = async () => {
    try {
      const res = await chatApi.call(room.id);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const setPref = async (patch) => {
    try {
      const res = await chatApi.prefs(room.id, patch);
      setRoom((prev) => ({ ...prev, ...res.data.room }));
      refreshUnread();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const rename = () => {
    let value = room.title;
    modal.confirm({
      title: t('chat.rename'),
      content: <Input defaultValue={room.title} maxLength={200} onChange={(event) => (value = event.target.value)} />,
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: () => chatApi.updateRoom(room.id, { title: value }).then((res) => setRoom((prev) => ({ ...prev, ...res.data.room }))),
    });
  };

  // Read receipts: my message is read once somebody else has read past it.
  const othersRead = useMemo(() => Math.max(0, ...members.filter((person) => person.id !== user.id).map((person) => person.lastReadId || 0)), [members, user.id]);
  const mentionNames = useMemo(() => new Set(members.map((person) => String(person.username).toLowerCase())), [members]);
  const typingNames = Object.values(typing).map((entry) => entry.name);

  const { timeZone } = useRegional();
  const rows = useMemo(() => {
    if (!messages) return [];
    const out = [];
    let prev = null;
    messages.forEach((item, index) => {
      const day = dayKey(item.createdAt);
      if (!prev || dayKey(prev.createdAt) !== day) out.push({ type: 'day', key: `d${item.id}`, label: dayLabel(item.createdAt, t, locale) });
      if (unreadFrom != null && item.id > unreadFrom && (!prev || prev.id <= unreadFrom) && item.author?.id !== user.id) out.push({ type: 'unread', key: 'unread' });
      const next = messages[index + 1];
      const joinsPrev = prev && prev.kind !== 'system' && item.kind !== 'system' && prev.author?.id === item.author?.id && new Date(item.createdAt) - new Date(prev.createdAt) < GROUP_GAP && dayKey(prev.createdAt) === day;
      const joinsNext = next && next.kind !== 'system' && item.kind !== 'system' && next.author?.id === item.author?.id && new Date(next.createdAt) - new Date(item.createdAt) < GROUP_GAP && dayKey(next.createdAt) === day;
      out.push({ type: 'message', key: item.id, item, first: !joinsPrev, last: !joinsNext });
      prev = item;
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, unreadFrom, t, locale, user.id, timeZone]);

  if (error) return <div className="cc-empty">{errorMessage(error)}</div>;
  if (!room) return <div className="cc-loading"><Skeleton active avatar paragraph={{ rows: 6 }} /></div>;

  const title = room.kind === 'entity' ? room.entityInfo?.title || room.title : room.title;
  const subtitle =
    room.kind === 'direct'
      ? room.other?.online
        ? t('chat.online')
        : `@${room.other?.username || ''}`
      : room.kind === 'group'
        ? t('chat.membersN', { n: members.length || room.memberCount })
        : room.entityInfo?.subtitle || t('chat.membersN', { n: members.length });

  // A hint inside a menu item; the click stays on the hint and does not run the item.
  const withHint = (text, id) => (
    <span className="hp-label">
      {text}
      <span onClick={(event) => event.stopPropagation()}>
        <Hint id={id} placement="left" />
      </span>
    </span>
  );

  const moreMenu = {
    items: [
      { key: 'mute', label: withHint(room.muted ? `🔔 ${t('chat.unmute')}` : `🔕 ${t('chat.mute')}`, 'chat.mute'), onClick: () => setPref({ muted: !room.muted }) },
      room.kind !== 'entity' && { key: 'pin', label: withHint(room.pinned ? `📌 ${t('chat.unpin')}` : `📌 ${t('chat.pin')}`, 'chat.pin'), onClick: () => setPref({ pinned: !room.pinned }) },
      room.kind === 'entity' && room.entityInfo?.link && { key: 'open', label: <Link to={room.entityInfo.link}>↗ {t('chat.openRecord')}</Link> },
      room.can?.manage && { key: 'rename', label: `✎ ${t('chat.rename')}`, onClick: rename },
      room.kind === 'group' && { type: 'divider' },
      room.kind === 'group' && {
        key: 'leave',
        danger: true,
        label: t('chat.leave'),
        onClick: () =>
          modal.confirm({
            title: t('chat.leaveConfirm', { title: room.title }),
            okText: t('chat.leave'),
            okButtonProps: { danger: true },
            cancelText: t('common.cancel'),
            onOk: () => chatApi.removeMember(room.id, user.id).then(() => window.history.back()),
          }),
      },
      room.kind !== 'entity' && { key: 'hide', label: withHint(t('chat.hide'), 'chat.hide'), onClick: () => setPref({ hidden: true }).then(() => window.history.back()) },
    ].filter(Boolean),
  };

  return (
    <div
      className={`cc${compact ? ' is-compact' : ''}${side ? ' has-side' : ''}`}
      onDragOver={(event) => {
        if (!room.can?.write || !event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget) && setDragging(false)}
      onDrop={(event) => {
        if (!room.can?.write) return;
        event.preventDefault();
        setDragging(false);
        composer.current?.upload(event.dataTransfer.files);
      }}
    >
      <div className="cc__main">
        {header && (
          <header className="cc-head">
            {header !== 'bare' && <RoomAvatar room={room} size={compact ? 34 : 40} />}
            <div className="cc-head__text">
              {room.kind === 'entity' && room.entityInfo?.link && header !== 'bare' ? (
                <Link to={room.entityInfo.link}>
                  <strong>{title}</strong>
                </Link>
              ) : (
                <strong>{header === 'bare' ? bareTitle || t(entity?.type === 'deal' ? 'chat.dealChat' : 'chat.taskChat') : title}</strong>
              )}
              <span>
                {room.muted && '🔕 '}
                {subtitle}
              </span>
            </div>
            <div className="cc-head__actions">
              <Tooltip title={t('chat.side.search')}>
                <button type="button" className={side === 'search' ? 'is-on' : ''} onClick={() => setSide(side === 'search' ? null : 'search')}>
                  <Glyph d={G.search} />
                </button>
              </Tooltip>
              {config.calls && room.can?.write && (
                <Tooltip title={t('chat.call.start')}>
                  <button type="button" onClick={startCall}>
                    <Glyph d={G.video} />
                  </button>
                </Tooltip>
              )}
              <Tooltip title={t('chat.side.members')}>
                <button type="button" className={`cc-head__people${side === 'members' ? ' is-on' : ''}`} onClick={() => setSide(side === 'members' ? null : 'members')}>
                  <Avatar.Group size={22} max={{ count: compact ? 2 : 3 }}>
                    {members.map((person) => (
                      <UserAvatar key={person.id} user={person} size={22} tip={false} />
                    ))}
                  </Avatar.Group>
                </button>
              </Tooltip>
              <Tooltip title={t('chat.side.files')}>
                <button type="button" className={side === 'files' ? 'is-on' : ''} onClick={() => setSide(side === 'files' ? null : 'files')}>
                  <Glyph d={G.files} />
                </button>
              </Tooltip>
              <Dropdown trigger={['click']} menu={moreMenu} placement="bottomRight">
                <button type="button" aria-label={t('chat.more')}>⋯</button>
              </Dropdown>
            </div>
          </header>
        )}

        <div className="cc-list" ref={list} onScroll={onScroll}>
          {!messages ? (
            <Skeleton active avatar paragraph={{ rows: 5 }} />
          ) : messages.length === 0 ? (
            <div className="cc-start">
              <RoomAvatar room={room} size={64} />
              <strong>{title}</strong>
              <span>{emptyHint || t('chat.startHint')}</span>
            </div>
          ) : (
            <>
              {hasOlder && <div className="cc-older">{t('chat.loadingOlder')}</div>}
              {rows.map((row) =>
                row.type === 'day' ? (
                  <div key={row.key} className="cc-day">
                    <span>{row.label}</span>
                  </div>
                ) : row.type === 'unread' ? (
                  <div key={row.key} className="cc-unread">
                    <span>{t('chat.newMessages')}</span>
                  </div>
                ) : (
                  <MessageItem
                    key={row.key}
                    message={row.item}
                    me={user}
                    first={row.first}
                    last={row.last}
                    showAuthor={room.kind !== 'direct'}
                    read={row.item.id <= othersRead}
                    mentions={mentionNames}
                    canWrite={room.can?.write}
                    onReply={setReplyTo}
                    onEdit={setEditing}
                    onDelete={remove}
                    onReact={react}
                    onJump={jump}
                    onImages={(images, index) => setGallery({ images: images.map((image) => ({ ...image, title: image.name })), index })}
                    extraActions={extraActions}
                  />
                )
              )}
            </>
          )}
        </div>

        {(below > 0 || !atBottom) && messages?.length > 0 && (
          <button type="button" className="cc-tobottom" onClick={backToLatest}>
            <Glyph d={G.down} size={16} />
            {below > 0 && <b>{below}</b>}
          </button>
        )}
        {typingNames.length > 0 && (
          <div className="cc-typing">
            <span className="cc-typing__dots">
              <i />
              <i />
              <i />
            </span>
            {typingNames.length === 1 ? t('chat.typingOne', { name: typingNames[0] }) : t('chat.typingMany', { n: typingNames.length })}
          </div>
        )}
        <Composer
          ref={composer}
          room={room}
          members={members.filter((person) => person.id !== user.id)}
          replyTo={replyTo}
          editing={editing}
          disabled={!room.can?.write}
          placeholder={placeholder}
          maxUploadMb={config.maxUploadMb || 100}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSent={sent}
          onEdited={(item) => {
            setEditing(null);
            setMessages((prev) => prev.map((entry) => (entry.id === item.id ? withMine(item) : entry)));
          }}
        />
        {dragging && <div className="cc-drop">{t('chat.dropHere')}</div>}
      </div>
      {side && <SidePanel room={room} tab={side} setTab={setSide} members={members} reloadMembers={reloadMembers} onJump={jump} onClose={() => setSide(null)} />}
      {gallery && (
        <ImageViewer
          images={gallery.images}
          index={gallery.index}
          onIndex={(index) => setGallery((prev) => ({ ...prev, index }))}
          onClose={() => setGallery(null)}
          src={{ file: (image, options) => (options?.download ? `${image.url}?download=1` : image.url) }}
          canDownload
        />
      )}
    </div>
  );
}
