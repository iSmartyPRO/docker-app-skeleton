import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dropdown, Spin } from 'antd';
import { useLocale } from '../context/LocaleContext';
import { formatRelative } from '../lib/format';
import { getUnreadNotifications, listNotifications, markNotificationsRead } from '../services/api';
import { MenuIcon } from './icons/menuIcons';

const POLL_MS = 45_000;
const MODULE_ICON = { tasks: 'tasks', calendar: 'calendar', kb: 'graduation', files: 'folder' };

/** Mirrors the unread counter on the installed app icon where supported. */
function setBadge(count) {
  try {
    if (count > 0) navigator.setAppBadge?.(count);
    else navigator.clearAppBadge?.();
  } catch {
    /* unsupported */
  }
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4.6 1.7 6.2 2.2 6.7H3.8c.5-.5 2.2-2.1 2.2-6.7Z" />
      <path d="M10 19.4a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * The bell: unread counter (polled, refreshed on focus), a panel with the
 * latest notifications, "mark all as read" and a shortcut to preferences.
 */
export default function NotificationBell() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastUnread = useRef(0);

  const refreshCount = useCallback(() => {
    getUnreadNotifications()
      .then((res) => {
        setUnread(res.data.unread);
        setBadge(res.data.unread);
        // New arrivals while the panel is open appear right away.
        if (res.data.unread > lastUnread.current) setItems((list) => (list ? null : list));
        lastUnread.current = res.data.unread;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(() => document.visibilityState === 'visible' && refreshCount(), POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    navigator.serviceWorker?.addEventListener?.('message', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      navigator.serviceWorker?.removeEventListener?.('message', onFocus);
    };
  }, [refreshCount]);

  // A filter switch (or a newer first page) makes answers already on the way stale.
  const shownFilter = useRef(filter);
  shownFilter.current = filter;
  const loadSeq = useRef(0);
  const load = useCallback(
    (before) => {
      const seq = before ? loadSeq.current : ++loadSeq.current;
      return listNotifications({ limit: 20, before, unread: filter === 'unread' ? '1' : undefined }).then((res) => {
        if (shownFilter.current !== filter || seq !== loadSeq.current) return;
        setItems((list) => (before ? [...(list || []), ...res.data.items] : res.data.items));
        setMore(res.data.more);
        setUnread(res.data.unread);
        setBadge(res.data.unread);
      }).catch((err) => {
        if (shownFilter.current === filter && seq === loadSeq.current) throw err;
      });
    },
    [filter]
  );

  useEffect(() => {
    if (open && !items) load().catch(() => setItems([]));
  }, [open, items, load]);

  useEffect(() => {
    if (open) {
      setItems(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const markAll = async () => {
    const res = await markNotificationsRead({ all: true });
    setUnread(res.data.unread);
    setBadge(res.data.unread);
    setItems((list) => (filter === 'unread' ? [] : (list || []).map((item) => ({ ...item, read: true }))));
  };

  const openItem = async (item) => {
    setOpen(false);
    if (!item.read) {
      markNotificationsRead({ ids: [item.id] })
        .then((res) => {
          setUnread(res.data.unread);
          setBadge(res.data.unread);
        })
        .catch(() => {});
      setItems((list) => (list || []).map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
    }
    if (item.link) navigate(item.link);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await load(items[items.length - 1]?.id);
    } finally {
      setLoadingMore(false);
    }
  };

  const panel = (
    <div className="bell__panel">
      <div className="bell__head">
        <strong>{t('notifications.title')}</strong>
        <div className="bell__filters">
          {['all', 'unread'].map((key) => (
            <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
              {t(`notifications.${key}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="bell__list">
        {!items ? (
          <div className="bell__empty"><Spin /></div>
        ) : items.length === 0 ? (
          <div className="bell__empty">
            <span className="bell__empty-icon"><BellIcon /></span>
            <span>{t(filter === 'unread' ? 'notifications.noUnread' : 'notifications.empty')}</span>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <button key={item.id} type="button" className={`bell__item${item.read ? '' : ' is-unread'}`} onClick={() => openItem(item)}>
                <span className="bell__icon">
                  <MenuIcon name={MODULE_ICON[item.module] || 'bell'} />
                </span>
                <span className="bell__text">
                  <span className="bell__title">{item.title}</span>
                  {item.body && <span className="bell__body">{item.body}</span>}
                  <span className="bell__time">{formatRelative(item.createdAt, locale)}</span>
                </span>
                {!item.read && <span className="bell__dot" aria-hidden="true" />}
              </button>
            ))}
            {more && (
              <button type="button" className="bell__more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Spin size="small" /> : t('notifications.more')}
              </button>
            )}
          </>
        )}
      </div>
      <div className="bell__foot">
        <button type="button" onClick={markAll} disabled={!unread}>
          {t('notifications.markAll')}
        </button>
        <Link to="/account/notifications" onClick={() => setOpen(false)}>
          {t('notifications.settings')}
        </Link>
      </div>
    </div>
  );

  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} placement="bottomRight" popupRender={() => panel} overlayClassName="bell">
      <button type="button" className={`chrome__icon bell__button${unread ? ' has-unread' : ''}`} aria-label={t('notifications.title')}>
        <BellIcon />
        {unread > 0 && <span className="bell__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    </Dropdown>
  );
}
