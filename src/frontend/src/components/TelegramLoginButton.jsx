import { useEffect, useRef } from 'react';

const INTENT_KEY = 'da_tg_intent';

export function setTelegramIntent(intent) {
  try {
    sessionStorage.setItem(INTENT_KEY, intent);
  } catch {
    /* ignore */
  }
}

export function takeTelegramIntent() {
  try {
    const value = sessionStorage.getItem(INTENT_KEY);
    sessionStorage.removeItem(INTENT_KEY);
    return value || 'login';
  } catch {
    return 'login';
  }
}

/**
 * Official Telegram Login Widget in redirect mode: after confirming in Telegram
 * the browser returns to /auth/telegram with signed query parameters.
 * (The JS-callback mode would require 'unsafe-eval' in the CSP.)
 */
export default function TelegramLoginButton({ botUsername, intent = 'login', size = 'large' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!botUsername || !ref.current) return undefined;
    const node = ref.current;
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', size);
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-auth-url', `${window.location.origin}/auth/telegram`);
    node.innerHTML = '';
    node.appendChild(script);
    return () => {
      node.innerHTML = '';
    };
  }, [botUsername, size]);

  return (
    <div
      ref={ref}
      className="tg-widget"
      onPointerDownCapture={() => setTelegramIntent(intent)}
      onFocusCapture={() => setTelegramIntent(intent)}
    />
  );
}
