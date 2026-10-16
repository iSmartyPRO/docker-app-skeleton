import { errorMessage } from '../../lib/errors';

/** An API error in the UI language: `<prefix>.errors.<CODE>` when translated, else the server text. */
export function knownError(err, t, prefix = 'org') {
  const code = err?.response?.data?.code;
  if (code) {
    const key = `${prefix}.errors.${code}`;
    const text = t(key, err?.response?.data?.info || {});
    if (text && text !== key) return text;
  }
  return errorMessage(err);
}
