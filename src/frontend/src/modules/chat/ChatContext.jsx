import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { chatApi } from './api';

/*
 * One live connection per tab (Server-Sent Events) shared by everything that
 * shows chats: the header button, the chat page, a task's conversation.
 * Components subscribe to events; the provider keeps the unread total and
 * tells the server which room is on screen, so no push arrives for it.
 */

const ChatContext = createContext({ enabled: false, unread: 0, subscribe: () => () => {}, setFocus: () => {}, refreshUnread: () => {} });

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const enabled = Boolean(user && settings?.modules?.chat?.enabled);
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set());
  const connection = useRef(null);
  const focus = useRef(null);
  const me = useRef(null);
  me.current = user?.id ?? null;

  const refreshUnread = useCallback(() => {
    if (!enabled) return;
    chatApi
      .unread()
      .then((res) => setUnread(res.data.unread))
      .catch(() => {});
  }, [enabled]);

  const sendFocus = useCallback(() => {
    if (!connection.current) return;
    chatApi.focus({ connection: connection.current, roomId: focus.current, visible: document.visibilityState === 'visible' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refreshUnread();
    const source = new EventSource('/api/app/chat/stream', { withCredentials: true });
    const emit = (type) => (event) => {
      let data = {};
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (type === 'hello') {
        connection.current = data.connection;
        setConnected(true);
        sendFocus();
        refreshUnread();
      }
      // The stream is shared by all of the person's tabs and marks nothing as "mine",
      // so own messages are recognised by the author.
      const own = data.message?.mine || (me.current != null && data.message?.author?.id === me.current);
      if (type === 'message' && !own && data.message?.kind !== 'system') {
        if (focus.current !== data.roomId || document.visibilityState !== 'visible') setUnread((n) => n + 1);
      }
      if (type === 'read' || type === 'room') refreshUnread();
      listeners.current.forEach((listener) => listener(type, data));
    };
    ['hello', 'message', 'message.update', 'message.delete', 'read', 'typing', 'room'].forEach((type) => source.addEventListener(type, emit(type)));
    source.onerror = () => setConnected(false);
    const onVisible = () => {
      sendFocus();
      if (document.visibilityState === 'visible') refreshUnread();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      source.close();
      connection.current = null;
      setConnected(false);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refreshUnread, sendFocus]);

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const setFocus = useCallback(
    (roomId) => {
      focus.current = roomId || null;
      sendFocus();
    },
    [sendFocus]
  );

  const value = useMemo(() => ({ enabled, unread, connected, subscribe, setFocus, refreshUnread, setUnread }), [enabled, unread, connected, subscribe, setFocus, refreshUnread]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useChat = () => useContext(ChatContext);

/** Runs `handler(type, data)` for every live chat event while mounted. */
export function useChatEvents(handler) {
  const { subscribe } = useChat();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((type, data) => ref.current(type, data)), [subscribe]);
}
