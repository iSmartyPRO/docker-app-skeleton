/** Human-readable message from an axios error (API `{ error }` first). */
export function errorMessage(err, fallback = 'Request failed') {
  return err?.response?.data?.error || err?.message || fallback;
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
