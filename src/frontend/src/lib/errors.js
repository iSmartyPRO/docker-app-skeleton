/** Human-readable message from an axios error (API `{ error }` first). */
export function errorMessage(err, fallback = 'Request failed') {
  return err?.response?.data?.error || err?.message || fallback;
}
