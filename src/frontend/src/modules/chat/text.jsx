import { Fragment } from 'react';

/*
 * Message text without HTML: **bold**, *italic* / _italic_, ~~strike~~,
 * `code`, ```blocks```, links and @mentions. Everything is built as React
 * elements, so nothing a person types can become markup.
 */

const INLINE = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|(?<![\w*])\*[^*\n]+\*(?!\w)|(?<![\w_])_[^_\n]+_(?!\w)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"»)]|@[a-zA-Z0-9._-]{3,32})/g;

function inline(text, key, { mentions, me }) {
  const out = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const k = `${key}-${index++}`;
    if (token.startsWith('**')) out.push(<strong key={k}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('~~')) out.push(<s key={k}>{token.slice(2, -2)}</s>);
    else if (token.startsWith('`')) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('*') || token.startsWith('_')) out.push(<em key={k}>{token.slice(1, -1)}</em>);
    else if (token.startsWith('@')) {
      const name = token.slice(1).toLowerCase();
      const known = !mentions || mentions.has(name);
      out.push(
        known ? (
          <span key={k} className={`cm-mention${me && name === me.toLowerCase() ? ' is-me' : ''}`}>
            {token}
          </span>
        ) : (
          token
        )
      );
    } else {
      out.push(
        <a key={k} href={token} target="_blank" rel="noopener noreferrer nofollow">
          {token.replace(/^https?:\/\//, '').slice(0, 60)}
          {token.replace(/^https?:\/\//, '').length > 60 ? '…' : ''}
        </a>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function MessageText({ text, mentions, me }) {
  const parts = String(text || '').split(/```\n?([\s\S]*?)```/g);
  return (
    <div className="cm-text">
      {parts.map((part, i) =>
        i % 2 ? (
          <pre key={i}>{part.replace(/\n$/, '')}</pre>
        ) : (
          <Fragment key={i}>
            {part.split('\n').map((line, j, lines) => (
              <Fragment key={j}>
                {inline(line, `${i}-${j}`, { mentions, me })}
                {j < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </Fragment>
        )
      )}
    </div>
  );
}

/** Just emoji (one to three): shown large, without a bubble. */
export function isEmojiOnly(text) {
  const value = String(text || '').trim();
  return Boolean(value) && value.length <= 16 && /^(\p{Extended_Pictographic}|‍|️|[\u{1F3FB}-\u{1F3FF}]|\s)+$/u.test(value) && [...value.replace(/\s/g, '')].length <= 6;
}
