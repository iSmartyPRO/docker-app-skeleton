const RETURN_KEY = 'portal_return_to';

// Same-site paths only: no //host, no /\host (browsers read a backslash as a slash), no control characters.
const safe = (path) => Boolean(path) && path.startsWith('/') && !/^\/[\/\\]/.test(path) && !/[\\\u0000-\u001f]/.test(path) && !path.startsWith('/login');

/** Remembers ?next=/app/… from the sign-in URL; it survives OAuth redirects. */
export function rememberReturnPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  if (safe(next)) {
    try {
      sessionStorage.setItem(RETURN_KEY, next);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Where to go after signing in (once), else the home page. */
export function takeReturnPath() {
  try {
    const next = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    if (safe(next)) return next;
  } catch {
    /* ignore */
  }
  return '/';
}

/** /login?next=<current page> */
export function loginUrl(location) {
  const here = `${location.pathname}${location.search}`;
  return here && here !== '/' ? `/login?next=${encodeURIComponent(here)}` : '/login';
}
