import { Fragment } from 'react';
import { Link } from 'react-router-dom';

/* A tiny, safe subset of Markdown for help texts: no HTML is ever injected. */

function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-${i++}`;
    if (token.startsWith('**')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else {
      const [, label, href] = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      out.push(
        href.startsWith('/') ? (
          <Link key={key} to={href}>
            {label}
          </Link>
        ) : (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        )
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Rich({ text, className = '' }) {
  const blocks = String(text || '').trim().split(/\n\s*\n/);
  return (
    <div className={`hp-rich ${className}`}>
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*- /.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*- /, ''), `${index}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((line) => /^\s*\d+\. /.test(line))) {
          return (
            <ol key={index}>
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*\d+\. /, ''), `${index}-${j}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line, `${index}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
