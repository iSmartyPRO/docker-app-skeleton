import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import Markdown from './Markdown';

const LIMIT = 2 * 1024 * 1024;

/** Plain text, JSON (pretty-printed) and Markdown files. */
export default function TextViewer({ url, ext }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url, { credentials: 'same-origin' })
      .then((res) => res.text())
      .then((body) => {
        let value = body.length > LIMIT ? `${body.slice(0, LIMIT)}\n…` : body;
        if (ext === 'json') {
          try {
            value = JSON.stringify(JSON.parse(body), null, 2);
          } catch {
            /* keep as is */
          }
        }
        if (!cancelled) setText(value);
      })
      .catch(() => !cancelled && setText(''));
    return () => {
      cancelled = true;
    };
  }, [url, ext]);
  if (text === null) return <div className="viewer-loading"><Spin /></div>;
  if (ext === 'md') return <div className="textv"><Markdown text={text} /></div>;
  return <pre className="textv textv--mono">{text}</pre>;
}
