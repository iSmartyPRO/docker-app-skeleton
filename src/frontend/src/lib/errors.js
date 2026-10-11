/** Human-readable message from an axios error (API `{ error }` first). */
export function errorMessage(err, fallback = 'Request failed') {
  const data = err?.response?.data;
  if (err?.response?.status === 429 && data?.code === 'RATE_LIMITED') {
    const minutes = Math.max(1, Math.ceil((Number(data.retryAfter) || 60) / 60));
    return document.documentElement.lang === 'ru'
      ? `Слишком много запросов подряд. Повторите через ${minutes} мин.`
      : `Too many requests in a row. Try again in ${minutes} min.`;
  }
  return data?.error || err?.message || fallback;
}

/**
 * Sign-in errors carry a machine `code`; show it in the UI language and fall
 * back to the server text for anything unknown.
 */
export function authErrorMessage(err, t) {
  const code = err?.response?.data?.code;
  if (code) {
    const key = `signin.errors.${code}`;
    const text = t(key);
    if (text !== key) return text;
  }
  return errorMessage(err);
}
